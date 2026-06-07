const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middleware/auth');
const { Interview, Candidate, Job, User, JobApplication, getNextSeq } = require('../models');
const {
  notifyUsers, notifyInterviewScheduled,
  notifyInterviewCompleted, notifyHrInterviewResult,
} = require('../lib/notify');
const {
  buildInterviewFilterForUser, resolveUserIdForInterview, resolveUserIdForCandidate,
} = require('../lib/candidateLink');
const ml = require('../services/mlClient');
const config = require('../config');
const { dedupeInterviewsByRole, assertCanScheduleInterview, summarizeInterviewForClient } = require('../lib/interviewDedup');
const { canScheduleInterviewForApplication } = require('../lib/interviewOutcome');
const { SCHEDULER_ROLES, TAKER_ROLES } = require('../lib/roles');

const upload = multer({ dest: config.uploadDir });
const router = express.Router();

const QUESTION_COUNT = 15;
const INTERVIEW_MINUTES = 30;

function isScheduler(role) {
  return SCHEDULER_ROLES.includes(role);
}

function isTaker(role) {
  return TAKER_ROLES.includes(role);
}

function buildJobContext(job, candidate) {
  if (!job) return candidate?.skills?.length ? `Candidate skills: ${candidate.skills.join(', ')}` : '';
  const parts = [
    `Role: ${job.title}`,
    job.experienceLevel ? `Level: ${job.experienceLevel}` : '',
    job.skills?.length ? `Required skills: ${job.skills.join(', ')}` : '',
    candidate?.skills?.length ? `Candidate skills: ${candidate.skills.join(', ')}` : '',
    job.description || '',
  ].filter(Boolean);
  return parts.join('\n\n');
}

function buildHarnessCandidateContext(candidate, application) {
  const parsed = application?.parsedData || {};
  const experience = parsed.experience || [];
  const resumeText = parsed.raw_text || parsed.summary || parsed.processed_description
    || parsed.processed_text || application?.jdFitSummary || '';
  return {
    name: application?.candidateName || candidate?.name || 'Candidate',
    email: application?.candidateEmail || candidate?.email || '',
    skills: {
      evidenced: application?.matchedSkills || parsed.skills || candidate?.skills || [],
      claimed_only: application?.missingSkills || [],
    },
    matched_skills: application?.matchedSkills || [],
    projects: parsed.projects || [],
    work_history: experience,
    experience,
    education: parsed.education || [],
    resume_text: resumeText,
    resume_summary: resumeText.slice(0, 4000),
  };
}

function buildHarnessScreeningResult(application) {
  const screening = application?.screening || {};
  return {
    total_score: screening.total_score ?? application?.jdScore ?? 0,
    ai_score: screening.ai_score ?? application?.jdScore ?? 0,
    top_strengths: screening.top_strengths || application?.matchedSkills || [],
    key_gaps: screening.key_gaps || application?.missingSkills || [],
    verdict: screening.verdict || application?.recommendation || '',
    candidate_type: screening.candidate_type || '',
  };
}

function buildSkillsMatrix(job) {
  const matrix = job?.skillsMatrix || job?.skills_matrix;
  if (matrix?.must_have?.length) {
    return {
      role_title: job?.title || matrix.role_title || 'Position',
      experience_level: job?.experienceLevel || job?.experience_level || matrix.experience_level || '2 years',
      must_have: matrix.must_have,
      nice_to_have: matrix.nice_to_have || [],
    };
  }
  const mustHave = (job?.skills || job?.required_skills || []).map((s) => (
    typeof s === 'string' ? { skill: s } : s
  ));
  const niceHave = (job?.niceToHaveSkills || job?.nice_to_have_skills || []).map((s) => (
    typeof s === 'string' ? { skill: s } : s
  ));
  return {
    role_title: job?.title || 'Position',
    experience_level: job?.experienceLevel || job?.experience_level || '2 years',
    must_have: mustHave,
    nice_to_have: niceHave,
  };
}

async function generateInterviewQuestions(job, candidate, application = null) {
  const description = job?.description || '';
  if (!description.trim()) {
    throw new Error('Job description is required before scheduling an AI interview.');
  }
  const perQ = Math.floor((INTERVIEW_MINUTES * 60) / QUESTION_COUNT);

  const tailored = await ml.generateTailoredQuestions({
    candidate: buildHarnessCandidateContext(candidate, application),
    screening_result: buildHarnessScreeningResult(application || {}),
    skills_matrix: buildSkillsMatrix(job),
    tech_stack_profile: job?.techStackProfile || job?.tech_stack_profile || {
      frameworks: job?.skills || [],
      repos_analyzed: job?.kbRepos || job?.kb_repos || [],
    },
    job_description: description,
    count: QUESTION_COUNT,
  });

  if (!tailored?.questions?.length) {
    throw new Error('Groq did not return interview questions. Check GROQ_API_KEY and retry.');
  }

  return tailored.questions.slice(0, QUESTION_COUNT).map((item, i) => ({
    ...item,
    id: item.id || i + 1,
    question: item.question || item.text,
    time_limit_seconds: item.time_limit_seconds || item.max_time_seconds || perQ,
  }));
}

function buildHarnessTranscript(questions, answers, candidateName) {
  const transcript = [];
  transcript.push({
    speaker: 'AI',
    text: `Welcome ${candidateName}. Let's begin your tailored technical interview.`,
  });
  for (const ans of answers || []) {
    if (ans.question) {
      transcript.push({ speaker: 'AI', text: ans.question });
    }
    if (ans.answer) {
      transcript.push({ speaker: 'You', text: ans.answer });
    }
  }
  return transcript;
}

async function resolveCandidateForUser(user) {
  let c = await Candidate.findOne({ email: user.email }).lean();
  if (!c) {
    const id = await getNextSeq('candidates');
    const created = await Candidate.create({
      id,
      name: user.name,
      email: user.email,
      skills: ['Communication', 'Problem Solving'],
      status: 'interview',
      source: 'user_profile',
    });
    c = created.toObject();
  }
  return c;
}

async function assertInterviewTaker(req, interview) {
  if (!isTaker(req.user.role)) return false;
  const filter = await buildInterviewFilterForUser(req.user);
  const match = await Interview.findOne({ id: interview.id, ...filter }).lean();
  return !!match;
}

function getDeadline(interview) {
  const d = interview.deadlineAt || interview.scheduledAt;
  return d ? new Date(d) : null;
}

function isPastDeadline(interview) {
  const deadline = getDeadline(interview);
  if (!deadline) return false;
  return Date.now() > deadline.getTime();
}

async function expireIfNeeded(interview) {
  if (interview.status === 'scheduled' && isPastDeadline(interview)) {
    interview.status = 'expired';
    await interview.save();
  }
  return interview;
}

function enrichInterviewMeta(item) {
  const deadline = getDeadline(item);
  const expired = item.status === 'expired' || (item.status === 'scheduled' && isPastDeadline(item));
  const msLeft = deadline ? deadline.getTime() - Date.now() : null;
  const attemptUsed = ['completed', 'analyzing', 'failed'].includes(item.status);
  const canStart = !attemptUsed && !expired
    && (item.status === 'scheduled' || item.status === 'in_progress');
  return {
    deadline_at: deadline ? deadline.toISOString() : null,
    deadlineAt: deadline ? deadline.toISOString() : null,
    scheduled_at: deadline ? deadline.toISOString() : null,
    is_expired: expired,
    attempt_used: attemptUsed,
    can_start: canStart,
    time_remaining_ms: msLeft != null ? Math.max(0, msLeft) : null,
  };
}

async function enrichInterviews(items) {
  const candidateIds = [...new Set(items.map((i) => i.candidateId).filter(Boolean))];
  const candidates = await Candidate.find({ id: { $in: candidateIds } }).lean();
  const byId = Object.fromEntries(candidates.map((c) => [c.id, c]));
  const enriched = items.map((item) => {
    const expired = item.status === 'scheduled' && isPastDeadline(item);
    const status = expired ? 'expired' : item.status;
    return {
      ...item,
      status,
      candidate_name: item.candidateName || byId[item.candidateId]?.name || 'Unknown',
      candidate_email: item.candidateEmail || byId[item.candidateId]?.email || '',
      ...enrichInterviewMeta({ ...item, status }),
    };
  });
  return dedupeInterviewsByRole(enriched, isPastDeadline);
}

function assertBeforeDeadline(interview) {
  if (isPastDeadline(interview)) {
    const err = new Error('Interview deadline has passed. Contact your recruiter to reschedule.');
    err.status = 403;
    throw err;
  }
}

async function notifyRecruiterInterview(io, interview, payload) {
  const recruiterIds = new Set([interview.scheduledBy].filter(Boolean));
  const recruiters = await User.find({
    role: { $in: SCHEDULER_ROLES },
    isActive: { $ne: false },
  }).select('id').lean();
  recruiters.forEach((u) => recruiterIds.add(u.id));
  if (recruiterIds.size) {
    await notifyUsers([...recruiterIds], payload, io);
  }
}

function applicationFilterForInterview(interview) {
  return interview.applicationId
    ? { id: interview.applicationId }
    : { candidateId: interview.candidateId, jobId: interview.jobId };
}

async function syncApplicationAfterInterview(interview, status, extra = {}) {
  await JobApplication.updateOne(
    applicationFilterForInterview(interview),
    { $set: { status, ...extra } },
  );
}

async function finalizeApplicationAfterInterview(interview, io) {
  await JobApplication.updateOne(
    applicationFilterForInterview(interview),
    {
      $set: {
        status: 'interview_completed',
        recommendation: interview.recommendation || '',
        aiInterviewReview: {
          decision: 'pending',
          note: '',
          reviewedAt: null,
        },
      },
    },
  );

  await Candidate.updateOne(
    { id: interview.candidateId },
    { $set: { status: 'interview_completed' } },
  );

  const application = await JobApplication.findOne(applicationFilterForInterview(interview)).lean();
  const candidate = await Candidate.findOne({ id: interview.candidateId }).lean();
  const userId = await resolveUserIdForInterview(interview, candidate, application);

  await notifyInterviewCompleted({
    userId,
    candidateEmail: interview.candidateEmail || candidate?.email,
    candidateName: interview.candidateName || candidate?.name,
    jobTitle: interview.jobTitle,
    rejected: false,
  }, io);
  await notifyHrInterviewResult({
    candidateName: interview.candidateName || candidate?.name || 'Candidate',
    jobTitle: interview.jobTitle,
    interviewScore: interview.interviewScore,
    compositeScore: interview.compositeScore,
    screeningScore: interview.screeningScore,
    verdict: interview.verdict,
    shortlistVerdict: interview.shortlistVerdict,
    strengths: interview.topStrengths,
    concerns: interview.concerns,
    recommendation: interview.recommendation,
  }, io);

  return { rejected: false, appStatus: 'interview_completed' };
}

async function runAnalysis(interviewId, io = null) {
  try {
    const interview = await Interview.findOne({ id: interviewId });
    if (!interview) return;

    const job = await Job.findOne({ id: interview.jobId }).lean();
    const candidate = await Candidate.findOne({ id: interview.candidateId }).lean();
    const ctx = interview.jobDescription
      || buildJobContext(job, candidate)
      || job?.description
      || job?.title
      || '';
    const answers = interview.answers || interview.qaLog || [];

    const application = await JobApplication.findOne(applicationFilterForInterview(interview)).lean();
    const screeningScore = application?.jdScore
      || application?.screening?.total_score
      || interview.screeningScore
      || 0;
    const harnessTranscript = interview.harnessTranscript?.length
      ? interview.harnessTranscript
      : buildHarnessTranscript(
        interview.questions,
        answers,
        interview.candidateName || 'Candidate',
      );

    const result = await ml.analyzeFullInterview({
      questions: interview.questions,
      answers,
      job_context: ctx,
      video_analysis: interview.videoScore || {},
      transcript: interview.transcript || '',
      harness_transcript: harnessTranscript,
      candidate_name: interview.candidateName || 'Candidate',
      role_title: interview.jobTitle || '',
      screening_score: screeningScore,
    });

    const evalMethod = result.evaluation_method || '';
    if (evalMethod !== 'harness_groq' && evalMethod !== 'harness_empty') {
      throw new Error(
        `Interview scoring requires Groq (got ${evalMethod || 'unknown'}). Check GROQ_API_KEY and ml-service.`,
      );
    }

    interview.technicalScore = result.technical_score;
    interview.communicationScore = result.communication_score;
    interview.confidenceScore = result.confidence_score;
    interview.sentimentScore = result.sentiment_score;
    interview.fluencyScore = result.fluency_score;
    interview.voiceScore = result.voice_score;
    interview.jdAlignmentScore = result.jd_alignment_score || 0;
    interview.problemSolvingScore = result.problem_solving_score || 0;
    interview.cultureFitScore = result.culture_fit_score || 0;
    interview.experienceDepthScore = result.experience_depth_score || 0;
    interview.screeningScore = result.screening_score ?? screeningScore;
    const interviewOnlyScore = result.interview_score ?? result.total_score ?? result.final_score ?? 0;
    const compositeScore = result.composite_score
      ?? (screeningScore
        ? Math.round(0.8 * screeningScore + 0.2 * interviewOnlyScore)
        : Math.round(interviewOnlyScore));
    interview.interviewScore = interviewOnlyScore;
    interview.compositeScore = compositeScore;
    interview.shortlistVerdict = result.shortlist_verdict
      || (compositeScore >= 50 ? 'Shortlisted for Final Round' : 'Not Shortlisted');
    interview.verdict = result.verdict || 'Unknown';
    interview.topStrengths = result.top_strengths || [];
    interview.concerns = result.concerns || [];
    interview.evaluationMethod = result.evaluation_method || 'unknown';
    interview.harnessEvaluation = result.harness_evaluation || null;
    interview.finalScore = compositeScore;
    interview.recommendation = result.recommendation || result.ai_feedback || interview.verdict;
    interview.aiFeedback = result.ai_feedback || result.recommendation || '';
    interview.perAnswerFeedback = result.per_answer_feedback;
    interview.analysisStatus = 'completed';
    interview.status = 'completed';
    interview.completedAt = new Date();
    await interview.save();

    await finalizeApplicationAfterInterview(interview, io);
    await notifyRecruiterInterview(io, interview, {
      type: 'interview_completed',
      title: 'AI interview done — Pass or Reject required',
      message: `${interview.candidateName || 'Candidate'} scored ${Math.round(interview.finalScore || 0)}% for ${interview.jobTitle}. HR must Pass or Reject before scheduling human panel.`,
      link: '/dashboard/applications',
      meta: {
        interviewId: interview.id,
        applicationId: interview.applicationId,
        candidateId: interview.candidateId,
        jobId: interview.jobId,
        finalScore: interview.finalScore,
        recommendation: interview.recommendation,
      },
    });
  } catch (err) {
    console.error('Interview analysis failed:', err.message);
    const interview = await Interview.findOne({ id: interviewId });
    await Interview.updateOne(
      { id: interviewId },
      { $set: { analysisStatus: 'failed', status: 'failed' } }
    );
    if (interview) {
      await syncApplicationAfterInterview(interview, 'interview_failed');
      await notifyRecruiterInterview(io, interview, {
        type: 'interview_failed',
        title: 'Interview analysis failed',
        message: `AI analysis failed for ${interview.candidateName || 'candidate'} — ${interview.jobTitle}. Review in Applications.`,
        link: '/dashboard/applications',
        meta: { interviewId: interview.id, applicationId: interview.applicationId },
      });
    }
  }
}

router.post('/schedule', auth(SCHEDULER_ROLES), async (req, res) => {
  const candidateId = parseInt(req.body.candidate_id, 10);
  const jobId = parseInt(req.body.job_id, 10);
  const deadlineRaw = req.body.deadline_at || req.body.scheduled_at;

  if (!candidateId || !jobId) {
    return res.status(400).json({ error: 'Candidate and job are required' });
  }
  if (!deadlineRaw) {
    return res.status(400).json({ error: 'Interview deadline (date & time) is required' });
  }

  const deadlineAt = new Date(deadlineRaw);
  if (Number.isNaN(deadlineAt.getTime())) {
    return res.status(400).json({ error: 'Invalid deadline date/time' });
  }
  if (deadlineAt.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Deadline must be in the future' });
  }

  const candidate = await Candidate.findOne({ id: candidateId }).lean();
  const job = await Job.findOne({ id: jobId }).lean();
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  try {
    await assertCanScheduleInterview(Interview, candidateId, jobId, isPastDeadline);
  } catch (err) {
    return res.status(err.status || 409).json({
      error: err.message,
      existing_interview_id: err.existingInterviewId,
    });
  }

  let application = null;
  if (req.body.application_id) {
    application = await JobApplication.findOne({ id: parseInt(req.body.application_id, 10) }).lean();
  }
  if (!application) {
    application = await JobApplication.findOne({ candidateId, jobId }).sort({ appliedAt: -1 }).lean();
  }
  if (!canScheduleInterviewForApplication(application)) {
    const msg = application?.status === 'rejected'
      ? 'Cannot schedule AI interview — application was rejected by HR.'
      : 'Shortlist the candidate in Applications inbox before scheduling an AI interview.';
    return res.status(400).json({ error: msg });
  }
  const linkedUserId = await resolveUserIdForCandidate(candidate, application);
  const notifyEmail = linkedUserId
    ? (await User.findOne({ id: linkedUserId }).lean())?.email
    : candidate.email;

  const jobContext = buildJobContext(job, candidate);
  let questions;
  try {
    questions = await generateInterviewQuestions(job, candidate, application);
  } catch (err) {
    const status = err.status || err.response?.status || 503;
    return res.status(status).json({
      error: err.message || 'Groq interview question generation failed. Ensure GROQ_API_KEY is set.',
    });
  }
  const screeningScore = application?.jdScore || application?.screening?.total_score || 0;
  const id = await getNextSeq('interviews');
  const candidateUserId = linkedUserId || application?.userId || null;

  const interview = await Interview.create({
    id,
    userId: candidateUserId || undefined,
    applicationId: application?.id,
    candidateId: candidate.id,
    candidateName: candidate.name,
    candidateEmail: notifyEmail || candidate.email,
    jobId: job.id,
    jobTitle: job.title,
    jobDescription: jobContext,
    questions,
    qaLog: [],
    screeningScore,
    durationMinutes: INTERVIEW_MINUTES,
    scheduledAt: deadlineAt,
    deadlineAt,
    scheduledBy: req.user.id,
    scheduledByName: req.user.name,
    analysisStatus: 'pending',
    status: 'scheduled',
  });

  if (application) {
    await JobApplication.updateOne(
      { id: application.id },
      {
        $set: {
          status: 'interview_scheduled',
          ...(candidateUserId ? { userId: candidateUserId } : {}),
        },
      },
    );
    if (candidateUserId) {
      await Candidate.updateOne(
        { id: candidate.id },
        { $set: { userId: candidateUserId, email: notifyEmail || candidate.email } },
      );
    }
  }

  const io = req.app.get('io');
  await notifyInterviewScheduled({
    userId: linkedUserId || null,
    candidateEmail: notifyEmail || candidate.email,
    candidateName: candidate.name,
    jobTitle: job.title,
    deadlineAt: deadlineAt.toISOString(),
  }, io);

  const obj = interview.toObject();
  res.json({
    ...obj,
    ...enrichInterviewMeta(obj),
    candidate_name: candidate.name,
    candidate_email: candidate.email,
    job: { id: job.id, title: job.title, description: job.description },
    message: `Interview scheduled — candidate must complete before ${deadlineAt.toLocaleString()}`,
  });
});

router.post('/start', auth(), async (req, res) => {
  const interviewId = parseInt(req.body.interview_id, 10);
  if (!interviewId) {
    return res.status(400).json({ error: 'Select a scheduled interview to begin' });
  }
  if (!isTaker(req.user.role)) {
    return res.status(403).json({ error: 'Only candidates can take interviews' });
  }

  const interview = await Interview.findOne({ id: interviewId });
  if (!interview) return res.status(404).json({ error: 'Interview not found' });
  await expireIfNeeded(interview);
  if (interview.status === 'expired' || isPastDeadline(interview)) {
    return res.status(403).json({
      error: 'Interview deadline has passed. Contact your recruiter to reschedule.',
      deadline_at: getDeadline(interview)?.toISOString(),
    });
  }
  if (interview.status === 'completed' || interview.status === 'analyzing') {
    return res.status(409).json({
      error: 'You have already completed this interview. Only one attempt is allowed per role.',
    });
  }
  if (interview.status === 'failed') {
    return res.status(409).json({
      error: 'Your interview attempt for this role has ended. Contact your recruiter.',
    });
  }
  if (!(await assertInterviewTaker(req, interview))) {
    return res.status(403).json({ error: 'This interview is not assigned to you' });
  }

  try {
    assertBeforeDeadline(interview);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  if (!interview.userId && req.user?.id) {
    interview.userId = req.user.id;
  }

  if (interview.status === 'scheduled') {
    interview.status = 'in_progress';
    interview.startedAt = new Date();
    await interview.save();
  } else if (interview.status !== 'in_progress') {
    return res.status(400).json({ error: 'This interview is not available to start' });
  }

  const job = await Job.findOne({ id: interview.jobId }).lean();
  const obj = interview.toObject();
  res.json({
    ...obj,
    ...enrichInterviewMeta(obj),
    attempt_used: interview.status !== 'scheduled',
    job: job ? { id: job.id, title: job.title, description: job.description } : null,
  });
});

router.post('/:id/save-answer', auth(), async (req, res) => {
  const interview = await Interview.findOne({ id: parseInt(req.params.id) });
  if (!interview) return res.status(404).json({ error: 'Not found' });
  if (!(await assertInterviewTaker(req, interview))) {
    return res.status(403).json({ error: 'Only the assigned candidate can answer' });
  }
  if (interview.status !== 'in_progress') {
    return res.status(409).json({ error: 'Interview is not active' });
  }
  try {
    assertBeforeDeadline(interview);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const entry = {
    question: req.body.question,
    answer: req.body.answer,
    questionIndex: req.body.question_index,
    spokenAt: new Date(),
    durationSeconds: req.body.duration_seconds || 0,
  };

  const qaLog = interview.qaLog || [];
  qaLog.push(entry);
  interview.qaLog = qaLog;
  interview.answers = qaLog.map((q) => ({ question: q.question, answer: q.answer }));
  interview.transcript = qaLog.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n');
  await interview.save();
  res.json({ saved: true, count: qaLog.length });
});

router.post('/:id/upload-recording', auth(), upload.single('recording'), async (req, res) => {
  const interview = await Interview.findOne({ id: parseInt(req.params.id) });
  if (!interview) return res.status(404).json({ error: 'Not found' });
  if (!(await assertInterviewTaker(req, interview))) {
    return res.status(403).json({ error: 'Only the assigned candidate can upload recordings' });
  }
  if (!['in_progress', 'analyzing'].includes(interview.status)) {
    return res.status(409).json({ error: 'Recording cannot be uploaded for this interview' });
  }

  const ext = path.extname(req.file.originalname) || '.webm';
  const dest = path.join(config.uploadDir, `interview_${interview.id}${ext}`);
  fs.renameSync(req.file.path, dest);

  interview.recordingPath = dest;
  interview.recordingDuration = parseInt(req.body.duration_seconds || '0', 10);
  await interview.save();
  res.json({ recording_saved: true, path: `interview_${interview.id}${ext}` });
});

router.post('/:id/submit', auth(), async (req, res) => {
  const interview = await Interview.findOne({ id: parseInt(req.params.id) });
  if (!interview) return res.status(404).json({ error: 'Not found' });
  if (!(await assertInterviewTaker(req, interview))) {
    return res.status(403).json({ error: 'Only the assigned candidate can submit' });
  }
  if (interview.status === 'completed' || interview.status === 'analyzing') {
    return res.status(409).json({
      error: 'Interview already submitted. Only one attempt is allowed per role.',
    });
  }
  if (interview.status !== 'in_progress') {
    return res.status(400).json({
      error: interview.status === 'scheduled'
        ? 'Start the interview before submitting.'
        : 'This interview cannot be submitted.',
    });
  }

  try {
    assertBeforeDeadline(interview);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  if (req.body.answers?.length) {
    interview.answers = req.body.answers;
    interview.qaLog = req.body.answers.map((a, i) => ({
      question: a.question,
      answer: a.answer,
      questionIndex: i,
      spokenAt: new Date(),
    }));
  }
  if (req.body.transcript) interview.transcript = req.body.transcript;
  const answers = interview.answers || interview.qaLog || [];
  interview.harnessTranscript = buildHarnessTranscript(
    interview.questions,
    answers,
    interview.candidateName || req.user?.name || 'Candidate',
  );
  if (req.body.video_analysis) {
    interview.videoScore = { ...interview.videoScore, ...req.body.video_analysis };
  }

  if (!interview.userId && req.user?.id) {
    interview.userId = req.user.id;
  }

  interview.analysisStatus = 'analyzing';
  interview.status = 'analyzing';
  interview.submittedAt = new Date();
  await interview.save();

  if (interview.applicationId && req.user?.id) {
    await JobApplication.updateOne(
      { id: interview.applicationId },
      { $set: { userId: req.user.id } },
    );
  }

  await syncApplicationAfterInterview(interview, 'interview_submitted');
  const io = req.app.get('io');
  await notifyRecruiterInterview(io, interview, {
    type: 'interview_submitted',
    title: 'Interview submitted',
    message: `${interview.candidateName || 'Candidate'} submitted the AI interview for ${interview.jobTitle}. Results will appear in Applications shortly.`,
    link: '/dashboard/applications',
    meta: {
      interviewId: interview.id,
      applicationId: interview.applicationId,
      candidateId: interview.candidateId,
      jobId: interview.jobId,
    },
  });

  res.json({
    id: interview.id,
    status: 'analyzing',
    analysis_status: 'analyzing',
    message: 'AI is analyzing your interview. Results will be ready in a few minutes.',
    estimated_minutes: 2,
  });

  setTimeout(() => runAnalysis(interview.id, io), 2000);
});

router.get('/', auth(), async (req, res) => {
  const items = await Interview.find().sort({ scheduledAt: -1, createdAt: -1 }).limit(100).lean();
  res.json(await enrichInterviews(items));
});

router.get('/my', auth(['candidate']), async (req, res) => {
  const filter = await buildInterviewFilterForUser(req.user);
  const items = await Interview.find(filter)
    .sort({ scheduledAt: -1, createdAt: -1 })
    .lean();

  // Backfill userId on legacy interviews so future lookups work
  await Promise.all(
    items
      .filter((i) => !i.userId && i.status === 'scheduled')
      .map((i) => Interview.updateOne({ id: i.id }, { $set: { userId: req.user.id } })),
  );

  res.json(await enrichInterviews(items));
});

router.get('/:id/status', auth(), async (req, res) => {
  const interview = await Interview.findOne({ id: parseInt(req.params.id) }).lean();
  if (!interview) return res.status(404).json({ error: 'Not found' });

  const application = await JobApplication.findOne(
    applicationFilterForInterview(interview),
  ).lean();
  const rejected = application?.status === 'rejected';

  res.json({
    id: interview.id,
    status: interview.status,
    analysis_status: interview.analysisStatus,
    application_status: application?.status || null,
    rejected,
    technical_score: interview.technicalScore,
    communication_score: interview.communicationScore,
    confidence_score: interview.confidenceScore,
    voice_score: interview.voiceScore,
    fluency_score: interview.fluencyScore,
    sentiment_score: interview.sentimentScore,
    interview_score: interview.interviewScore,
    final_score: interview.compositeScore ?? interview.finalScore,
    overall_score: interview.interviewScore ?? interview.finalScore,
    jd_alignment_score: interview.jdAlignmentScore,
    problem_solving_score: interview.problemSolvingScore,
    culture_fit_score: interview.cultureFitScore,
    experience_depth_score: interview.experienceDepthScore,
    screening_score: interview.screeningScore,
    composite_score: interview.compositeScore ?? interview.finalScore,
    shortlist_verdict: interview.shortlistVerdict,
    verdict: interview.verdict,
    top_strengths: interview.topStrengths,
    concerns: interview.concerns,
    evaluation_method: interview.evaluationMethod,
    job_title: interview.jobTitle,
    recommendation: interview.recommendation,
    ai_feedback: interview.aiFeedback,
    per_answer_feedback: interview.perAnswerFeedback,
    qa_log: interview.qaLog,
    recording_path: interview.recordingPath ? true : false,
    completed_at: interview.completedAt,
    scheduled_at: interview.scheduledAt,
  });
});

router.get('/:id', auth(), async (req, res) => {
  const interview = await Interview.findOne({ id: parseInt(req.params.id) }).lean();
  if (!interview) return res.status(404).json({ error: 'Not found' });
  const [enriched] = await enrichInterviews([interview]);
  res.json(enriched);
});

router.post('/:id/analyze-frame', auth(), async (req, res) => {
  const interview = await Interview.findOne({ id: parseInt(req.params.id) });
  if (!interview) return res.status(404).json({ error: 'Not found' });
  if (!(await assertInterviewTaker(req, interview))) {
    return res.status(403).json({ error: 'Only the assigned candidate can use the interview camera' });
  }
  if (interview.status !== 'in_progress') {
    return res.status(409).json({ error: 'Camera analysis is only available during an active interview' });
  }
  const analysis = await ml.analyzeVideo(req.body.image);
  const existing = interview.videoScore || {};
  const fc = (existing.frame_count || 0) + 1;
  for (const k of ['eye_contact_score', 'attention_score', 'fluency_score', 'sentiment_score']) {
    existing[k] = Math.round(((existing[k] || 0) * (fc - 1) + (analysis[k] || 0)) / fc);
  }
  Object.assign(existing, { face_present: analysis.face_present, expression: analysis.expression, frame_count: fc });
  interview.videoScore = existing;
  await interview.save();
  res.json(existing);
});

module.exports = router;
