const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { auth } = require('../middleware/auth');
const { Job, JobApplication, Candidate, User, Interview, getNextSeq } = require('../models');
const { dedupeInterviewsByRole, summarizeInterviewForClient } = require('../lib/interviewDedup');
const ml = require('../services/mlClient');
const config = require('../config');
const {
  processCandidateApplication, createJobApplicationRecord, finalizeApplicationAfterScreening,
} = require('../lib/applicationService');
const { runEmailInBackground } = require('../lib/emailAsync');
const {
  notifyUsers, notifyCandidateRejected, emailRecruiterMessage,
  notifyHumanInterviewScheduled, notifyFinalDecision, notifyOfferResponse,
} = require('../lib/notify');
const { ensureCandidateForUser, resolveUserIdForCandidate } = require('../lib/candidateLink');
const { RECRUITER_ROLES, RESUME_VIEW_ROLES } = require('../lib/roles');
const { createInterviewEvent, isCalendarConfigured } = require('../lib/googleCalendar');

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}
const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: (config.maxUploadMb || 50) * 1024 * 1024 },
});
const router = express.Router();

function hasStoredResume(app) {
  if (!app) return false;
  if (app.resumeData?.length) return true;
  if (app.resumePath && fs.existsSync(app.resumePath)) return true;
  return false;
}

function sanitizeApplication(app) {
  if (!app) return app;
  const { resumeData, ...rest } = app;
  return {
    ...rest,
    hasResume: hasStoredResume(app),
  };
}

function normalizeJob(job) {
  if (!job) return null;
  return {
    ...job,
    required_skills: job.skills || job.required_skills || [],
    nice_to_have_skills: job.niceToHaveSkills || job.nice_to_have_skills || [],
    skills_matrix: job.skillsMatrix || job.skills_matrix || null,
    jd_json: job.jdJson || job.jd_json || null,
    tech_stack_profile: job.techStackProfile || job.tech_stack_profile || null,
    pipeline: job.pipeline || [],
    experience_level: job.experienceLevel || job.experience_level,
    difficulty_level: job.difficultyLevel || job.difficulty_level,
    interview_questions: job.interviewQuestions || job.interview_questions || [],
    salary_insights: job.salaryInsights || job.salary_insights,
    created_by_name: job.createdByName || job.created_by_name,
    posted_at: job.createdAt || job.posted_at,
    status: job.status || 'open',
    generated_by: job.generatedBy || job.generated_by,
    kb_repos: job.kbRepos || job.kb_repos || [],
    employment_type: job.employmentType || job.employment_type || 'full_time',
    department: job.department,
  };
}

router.post('/generate-from-kb', auth(RECRUITER_ROLES), async (req, res) => {
  try {
    const generated = await ml.generateJDFromKB({
      role_title: req.body.role_title || req.body.title,
      experience_level: req.body.experience_level || '2 years',
      department: req.body.department || 'Engineering',
      feedback: req.body.feedback || '',
    });
    const id = await getNextSeq('jobs');
    const job = await Job.create({
      id,
      title: generated.title || req.body.role_title,
      description: generated.description,
      skills: generated.required_skills || [],
      niceToHaveSkills: generated.nice_to_have_skills || [],
      skillsMatrix: generated.skills_matrix || null,
      jdJson: generated.jd_json || null,
      techStackProfile: generated.tech_stack_profile || null,
      pipeline: generated.pipeline || [],
      experienceLevel: generated.experience_level,
      interviewQuestions: [],
      difficultyLevel: generated.difficulty_level,
      salaryInsights: generated.salary_insights || {},
      kbRepos: generated.kb_repos || [],
      generatedBy: 'groq',
      employmentType: req.body.employment_type || 'full_time',
      department: req.body.department || 'Engineering',
      createdBy: req.user.id,
      createdByName: req.user.name,
      status: 'draft',
    });
    res.status(201).json(normalizeJob(job.toObject()));
  } catch (err) {
    const status = err.status || err.response?.status || 500;
    console.error('[jobs] generate-from-kb failed:', err.message);
    res.status(status).json({
      error: err.message || 'JD generation from knowledge base failed. Ensure ML service and GROQ_API_KEY are set.',
      hint: status === 503
        ? 'Wake ML at /health, confirm GROQ_API_KEY on neurohr service, and retry.'
        : undefined,
    });
  }
});

router.get('/calendar-status', auth(RECRUITER_ROLES), (req, res) => {
  res.json({ calendar_configured: isCalendarConfigured() });
});

router.get('/knowledgebase/status', auth(RECRUITER_ROLES), async (req, res) => {
  try {
    const status = await ml.kbStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Knowledge base unavailable' });
  }
});

router.post('/', auth(RECRUITER_ROLES), async (req, res) => {
  try {
    const analysis = await ml.analyzeJD(req.body.description, req.body.title);
    const id = await getNextSeq('jobs');
    const job = await Job.create({
      id,
      title: req.body.title,
      description: req.body.description,
      skills: analysis.required_skills || [],
      experienceLevel: analysis.experience_level,
      interviewQuestions: [],
      difficultyLevel: analysis.difficulty_level,
      salaryInsights: analysis.salary_insights || {},
      createdBy: req.user.id,
      createdByName: req.user.name,
      status: 'draft',
      generatedBy: 'groq',
      employmentType: req.body.employment_type || 'full_time',
      department: req.body.department || 'Engineering',
    });
    res.status(201).json(normalizeJob(job.toObject()));
  } catch (err) {
    res.status(err.status || err.response?.status || 500).json({
      error: err.message || 'Groq JD analysis failed. Ensure GROQ_API_KEY is set and ml-service is running.',
    });
  }
});

function jobListFilter(user, includeClosed = false) {
  if (includeClosed) return {};
  if (RECRUITER_ROLES.includes(user.role)) {
    return { status: { $in: ['open', 'draft'] } };
  }
  return { status: 'open' };
}

router.get('/', auth(), async (req, res) => {
  const filter = jobListFilter(req.user, req.query.include_closed === 'true');
  const jobs = await Job.find(filter).sort({ createdAt: -1 }).lean();

  const applicantCounts = await JobApplication.aggregate([
    { $group: { _id: '$jobId', count: { $sum: 1 } } },
  ]);
  const countByJob = Object.fromEntries(applicantCounts.map((r) => [r._id, r.count]));

  let appliedJobIds = new Set();
  if (req.user.role === 'candidate') {
    const candidate = await ensureCandidateForUser(req.user);
    const apps = await JobApplication.find({
      $or: [{ userId: req.user.id }, { candidateId: candidate.id }],
    }).lean();
    appliedJobIds = new Set(apps.map((a) => a.jobId));
  }

  res.json(jobs.map((j) => normalizeJob({
    ...j,
    applied: appliedJobIds.has(j.id),
    applicant_count: countByJob[j.id] || 0,
  })));
});

router.get('/applications/my', auth(['candidate']), async (req, res) => {
  const candidate = await ensureCandidateForUser(req.user);
  const apps = await JobApplication.find({
    $or: [{ userId: req.user.id }, { candidateId: candidate.id }],
  })
    .select('-resumeData')
    .sort({ appliedAt: -1 })
    .lean();
  res.json(await attachInterviewSummaries(apps));
});

function isInterviewPastDeadline(item) {
  const d = item.deadlineAt || item.scheduledAt;
  if (!d) return false;
  return Date.now() > new Date(d).getTime();
}

async function attachInterviewSummaries(apps) {
  if (!apps.length) return apps.map(sanitizeApplication);
  const interviews = await Interview.find({
    $or: apps.map((a) => ({ candidateId: a.candidateId, jobId: a.jobId })),
  }).sort({ id: -1 }).lean();
  const unique = dedupeInterviewsByRole(interviews, isInterviewPastDeadline);
  const byKey = Object.fromEntries(
    unique.map((i) => [`${i.candidateId}-${i.jobId}`, summarizeInterviewForClient(i)]),
  );
  return apps.map((app) => ({
    ...sanitizeApplication(app),
    interview: byKey[`${app.candidateId}-${app.jobId}`] || null,
  }));
}

router.get('/applications/inbox', auth(RECRUITER_ROLES), async (req, res) => {
  const filter = {};
  if (req.query.job_id) filter.jobId = parseInt(req.query.job_id, 10);
  if (req.query.status) filter.status = req.query.status;
  const apps = await JobApplication.find(filter)
    .select('-resumeData')
    .sort({ appliedAt: -1 })
    .limit(200)
    .lean();
  res.json(await attachInterviewSummaries(apps));
});

router.get('/applications/:appId/resume', auth(), async (req, res) => {
  const app = await JobApplication.findOne({ id: parseInt(req.params.appId, 10) });
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const isStaff = RESUME_VIEW_ROLES.includes(req.user.role);
  const isOwner = app.userId === req.user.id;
  if (!isStaff && !isOwner) return res.status(403).json({ error: 'Forbidden' });

  let fileName = app.resumeFileName || path.basename(app.resumePath || 'resume.pdf');
  let mimeType = app.resumeMimeType || 'application/octet-stream';

  if (!app.resumeData?.length && app.resumePath && fs.existsSync(app.resumePath)) {
    app.resumeData = fs.readFileSync(app.resumePath);
    if (!app.resumeFileName) app.resumeFileName = path.basename(app.resumePath);
    if (!app.resumeMimeType) {
      mimeType = fileName.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      app.resumeMimeType = mimeType;
    }
    await app.save();
    fileName = app.resumeFileName;
    mimeType = app.resumeMimeType;
  }

  if (app.resumeData?.length) {
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    return res.send(app.resumeData);
  }

  if (app.resumePath && fs.existsSync(app.resumePath)) {
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    return res.sendFile(path.resolve(app.resumePath));
  }

  return res.status(404).json({ error: 'Resume file not found' });
});

async function resolveCandidateUserId(app) {
  if (app.userId) return app.userId;
  const candidate = await Candidate.findOne({ id: app.candidateId }).lean();
  return resolveUserIdForCandidate(candidate, app);
}

async function notifyCandidateAboutApplication(app, payload, io) {
  const userId = await resolveCandidateUserId(app);
  if (userId) await notifyUsers([userId], payload, io);
  return userId;
}

router.patch('/applications/:appId/status', auth(RECRUITER_ROLES), async (req, res) => {
  const app = await JobApplication.findOne({ id: parseInt(req.params.appId, 10) });
  if (!app) return res.status(404).json({ error: 'Application not found' });
  const status = req.body.status || app.status;
  const customMessage = String(req.body.message || '').trim();
  app.status = status;
  await app.save();
  const io = req.app.get('io');
  if (customMessage) {
    await notifyCandidateAboutApplication(app, {
      type: 'recruiter_message',
      title: `Message from recruiter — ${app.jobTitle}`,
      message: customMessage,
      link: '/dashboard/job-openings',
      meta: {
        applicationId: app.id,
        jobId: app.jobId,
        status,
        recruiterId: req.user.id,
        recruiterName: req.user.name,
      },
    }, io);
  } else if (status === 'shortlisted') {
    await notifyCandidateAboutApplication(app, {
      type: 'shortlisted',
      title: `Shortlisted — ${app.jobTitle}`,
      message: `You have been shortlisted for ${app.jobTitle}. A recruiter will schedule your AI interview soon.`,
      link: '/dashboard/job-openings',
      meta: { applicationId: app.id, jobId: app.jobId, status },
    }, io);
  } else if (status === 'rejected') {
    const rejectReason = String(req.body.reason || req.body.stage || '').toLowerCase();
    const isScreeningReject = rejectReason === 'screening'
      || !['interview_completed', 'human_interview_scheduled', 'hired'].includes(app.status);
    await notifyCandidateRejected(await resolveCandidateUserId(app), {
      jobTitle: app.jobTitle,
      applicationId: app.id,
      jobId: app.jobId,
      jdScore: app.jdScore,
      candidateName: app.candidateName,
      candidateEmail: app.candidateEmail,
      reason: isScreeningReject ? 'screening' : 'interview',
      customMessage: `Your application for ${app.jobTitle} was not selected to move forward.`,
    }, io);
  } else {
    await notifyCandidateAboutApplication(app, {
      type: 'application_update',
      title: 'Application update',
      message: `Your application for ${app.jobTitle} is now: ${status.replace(/_/g, ' ')}`,
      link: '/dashboard/job-openings',
      meta: { applicationId: app.id, jobId: app.jobId, status },
    }, io);
  }
  const obj = app.toObject();
  delete obj.resumeData;
  res.json({ ...obj, hasResume: hasStoredResume(app) });
});

router.post('/applications/:appId/message', auth(RECRUITER_ROLES), async (req, res) => {
  const app = await JobApplication.findOne({ id: parseInt(req.params.appId, 10) });
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const interview = await Interview.findOne({
    candidateId: app.candidateId,
    jobId: app.jobId,
  }).sort({ id: -1 }).lean();

  if (!interview || interview.status !== 'completed') {
    return res.status(400).json({
      error: 'You can send a follow-up message after the candidate completes the AI interview.',
    });
  }

  const nextStatus = req.body.status;
  if (nextStatus && nextStatus !== app.status) {
    app.status = nextStatus;
    await app.save();
  }

  const userId = await resolveCandidateUserId(app);
  if (!userId) {
    return res.status(400).json({ error: 'No candidate account linked to this application' });
  }

  const io = req.app.get('io');
  await notifyUsers([userId], {
    type: 'recruiter_message',
    title: `Message from recruiter — ${app.jobTitle}`,
    message,
    link: '/dashboard/job-openings',
    meta: {
      applicationId: app.id,
      jobId: app.jobId,
      status: app.status,
      recruiterId: req.user.id,
      recruiterName: req.user.name,
      interviewScore: interview?.finalScore,
      recommendation: interview?.recommendation,
    },
  }, io);

  runEmailInBackground(
    () => emailRecruiterMessage({
      candidateEmail: app.candidateEmail,
      candidateName: app.candidateName,
      jobTitle: app.jobTitle,
      message,
    }),
    `recruiter-message-${app.id}`,
  );

  const obj = app.toObject();
  delete obj.resumeData;
  res.json({ ...obj, hasResume: hasStoredResume(app), notified: true, email_queued: true });
});

router.post('/applications/:appId/ai-interview-decision', auth(RECRUITER_ROLES), async (req, res) => {
  const app = await JobApplication.findOne({ id: parseInt(req.params.appId, 10) });
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const interview = await Interview.findOne({
    candidateId: app.candidateId,
    jobId: app.jobId,
    status: 'completed',
  }).sort({ id: -1 }).lean();

  if (!interview) {
    return res.status(400).json({ error: 'AI interview must be completed before HR review.' });
  }

  const decision = String(req.body.decision || '').trim().toLowerCase();
  if (!['qualified', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "qualified" (pass) or "reject"' });
  }

  const note = String(req.body.note || '').trim();
  app.aiInterviewReview = {
    decision: decision === 'qualified' ? 'qualified' : 'rejected',
    note,
    reviewedBy: req.user.id,
    reviewedByName: req.user.name,
    reviewedAt: new Date(),
  };

  const io = req.app.get('io');

  if (decision === 'reject') {
    app.status = 'rejected';
    await app.save();
    await Candidate.updateOne({ id: app.candidateId }, { $set: { status: 'rejected' } });
    await notifyCandidateRejected(await resolveCandidateUserId(app), {
      jobTitle: app.jobTitle,
      finalScore: interview.finalScore,
      compositeScore: interview.compositeScore,
      verdict: interview.verdict,
      shortlistVerdict: interview.shortlistVerdict,
      jdScore: app.jdScore,
      matchedSkills: app.matchedSkills,
      screening: app.screening,
      applicationId: app.id,
      jobId: app.jobId,
      interviewId: interview.id,
      recommendation: interview.recommendation,
      candidateName: app.candidateName,
      candidateEmail: app.candidateEmail,
      reason: 'interview',
      customMessage: note || `After reviewing your AI interview for ${app.jobTitle}, we will not be moving forward.`,
    }, io);
  } else {
    app.status = 'interview_completed';
    await app.save();
    const userId = await resolveCandidateUserId(app);
    if (userId) {
      await notifyUsers([userId], {
        type: 'ai_interview_passed',
        title: `Passed HR review — ${app.jobTitle}`,
        message: `You passed HR review after the AI interview. A panel interview may be scheduled soon.`,
        link: '/dashboard/job-openings',
        meta: { applicationId: app.id, jobId: app.jobId },
      }, io);
    }
  }

  const obj = app.toObject();
  delete obj.resumeData;
  res.json({ ...obj, hasResume: hasStoredResume(app), interview: summarizeInterviewForClient(interview) });
});

router.post('/applications/:appId/schedule-human-interview', auth(RECRUITER_ROLES), async (req, res) => {
  const app = await JobApplication.findOne({ id: parseInt(req.params.appId, 10) });
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const interview = await Interview.findOne({
    candidateId: app.candidateId,
    jobId: app.jobId,
    status: 'completed',
  }).sort({ id: -1 }).lean();

  if (!interview) {
    return res.status(400).json({ error: 'Schedule human interview only after the candidate completes the AI interview.' });
  }
  if (app.status === 'rejected' || app.aiInterviewReview?.decision === 'rejected') {
    return res.status(400).json({ error: 'Cannot schedule human interview for a rejected application.' });
  }
  if (app.aiInterviewReview?.decision !== 'qualified') {
    return res.status(400).json({
      error: 'Pass the candidate after AI interview review before scheduling the human panel.',
    });
  }

  const interviewDate = String(req.body.interview_date || '').trim();
  const interviewTime = String(req.body.interview_time || '').trim();
  if (!interviewDate || !interviewTime) {
    return res.status(400).json({ error: 'interview_date and interview_time are required' });
  }

  let interviewers = Array.isArray(req.body.interviewers) ? req.body.interviewers : [];
  if (!interviewers.length && req.body.interviewer_email) {
    interviewers.push({
      name: req.body.interviewer_name || 'Interviewer',
      email: req.body.interviewer_email,
      role: req.body.interviewer_role || 'Hiring Manager',
    });
  }

  const seenEmails = new Set();
  interviewers = interviewers
    .map((i) => ({
      employeeId: i.employeeId,
      name: String(i.name || '').trim() || 'Interviewer',
      email: String(i.email || '').trim().toLowerCase(),
      role: String(i.role || i.designation || '').trim() || 'Panel Member',
      designation: i.designation,
      department: i.department,
    }))
    .filter((i) => {
      if (!i.email || !i.email.includes('@')) return false;
      if (seenEmails.has(i.email)) return false;
      seenEmails.add(i.email);
      return true;
    });
  if (!interviewers.length) {
    return res.status(400).json({ error: 'Add at least one interviewer Gmail address.' });
  }

  const durationMinutes = parseInt(req.body.duration_minutes, 10) || 60;
  const meetLinkInput = String(req.body.meet_link || '').trim();
  const appId = app.id;

  app.humanInterview = {
    interviewDate,
    interviewTime,
    durationMinutes,
    meetLink: meetLinkInput,
    calendarEventId: '',
    calendarHtmlLink: '',
    meetLinkSource: meetLinkInput ? 'manual' : 'pending',
    interviewers,
    notes: String(req.body.notes || '').trim(),
    roundNumber: parseInt(req.body.round_number, 10) || 1,
    status: 'scheduled',
    scheduledBy: req.user.id,
    scheduledByName: req.user.name,
    scheduledAt: new Date(),
  };
  app.status = 'human_interview_scheduled';
  await app.save();

  runEmailInBackground(async () => {
    let meetLink = meetLinkInput;
    let calendarEventId = '';
    let calendarHtmlLink = '';
    let meetLinkSource = meetLink ? 'manual' : 'pending';

    if (!meetLink) {
      const aiScore = interview.interviewScore ?? interview.finalScore ?? 0;
      const cal = await createInterviewEvent({
        candidateName: app.candidateName,
        candidateEmail: app.candidateEmail,
        interviewers,
        date: interviewDate,
        time: interviewTime,
        durationMinutes,
        jobTitle: app.jobTitle,
        description: `AI interview score: ${Math.round(aiScore)}/100 — ${interview.verdict || interview.shortlistVerdict || ''}`,
      });
      if (cal.meet_link) {
        meetLink = cal.meet_link;
        calendarEventId = cal.event_id || '';
        calendarHtmlLink = cal.html_link || '';
        meetLinkSource = 'google_calendar';
        await JobApplication.updateOne(
          { id: appId },
          {
            $set: {
              'humanInterview.meetLink': meetLink,
              'humanInterview.calendarEventId': calendarEventId,
              'humanInterview.calendarHtmlLink': calendarHtmlLink,
              'humanInterview.meetLinkSource': meetLinkSource,
            },
          },
        );
      } else if (cal.error) {
        console.warn('[schedule-human-interview] Calendar:', cal.error);
        meetLinkSource = 'calendar_unavailable';
      }
    }

    const appWithResume = await JobApplication.findOne({ id: appId }).lean();
    if (appWithResume?.humanInterview && meetLink) {
      appWithResume.humanInterview.meetLink = meetLink;
      appWithResume.humanInterview.meetLinkSource = meetLinkSource;
    }
    return notifyHumanInterviewScheduled(appWithResume, interview);
  }, `human-interview-${appId}`);

  const appWithResume = await JobApplication.findOne({ id: appId }).lean();
  const obj = app.toObject();
  delete obj.resumeData;
  res.json({
    ...obj,
    hasResume: hasStoredResume(appWithResume),
    email_queued: true,
    meet_link: meetLinkInput || null,
    meet_link_pending: !meetLinkInput,
    meet_link_source: meetLinkInput ? 'manual' : 'pending',
    message: meetLinkInput
      ? 'Panel scheduled — Groq invitation emails sending'
      : 'Panel scheduled — Meet link and Groq emails sending in background',
  });
});

router.post('/applications/:appId/complete-human-interview', auth(RECRUITER_ROLES), async (req, res) => {
  const app = await JobApplication.findOne({ id: parseInt(req.params.appId, 10) });
  if (!app) return res.status(404).json({ error: 'Application not found' });

  if (app.humanInterview?.status !== 'scheduled') {
    return res.status(400).json({
      error: app.humanInterview?.status === 'completed'
        ? 'Human panel already marked completed.'
        : 'Schedule human panel interview before marking it complete.',
    });
  }

  const now = new Date();
  app.humanInterview.status = 'completed';
  app.humanInterview.completedAt = now;
  app.humanInterview.completedBy = req.user.id;
  app.humanInterview.completedByName = req.user.name;
  app.humanInterview.panelNotes = String(req.body.notes || req.body.panel_notes || '').trim();
  app.status = 'human_interview_completed';
  await app.save();

  const userId = app.userId || (await User.findOne({ email: app.candidateEmail }).lean())?.id;
  const io = req.app.get('io');
  if (userId) {
    await notifyUsers([userId], {
      type: 'human_panel_completed',
      title: `Panel complete — ${app.jobTitle}`,
      message: 'Your human interview round is complete. Final hiring decision will follow shortly.',
      link: '/dashboard/job-openings',
      meta: { applicationId: app.id, jobId: app.jobId },
    }, io);
  }

  const obj = app.toObject();
  delete obj.resumeData;
  res.json({
    ...sanitizeApplication(obj),
    hasResume: hasStoredResume(app),
    message: 'Human panel marked complete — you can now send offer or rejection.',
  });
});

router.post('/applications/:appId/final-decision', auth(RECRUITER_ROLES), async (req, res) => {
  const app = await JobApplication.findOne({ id: parseInt(req.params.appId, 10) });
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const decision = String(req.body.decision || '').trim().toLowerCase();
  if (!['selected', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "selected" or "rejected"' });
  }

  const salary = String(req.body.salary || '').trim();

  if (decision === 'selected') {
    if (!salary) {
      return res.status(400).json({ error: 'Enter salary / offer compensation before sending the offer email.' });
    }
    if (app.aiInterviewReview?.decision !== 'qualified') {
      return res.status(400).json({ error: 'Candidate must pass HR AI review before offer.' });
    }
    if (app.humanInterview?.status !== 'completed') {
      return res.status(400).json({ error: 'Mark human panel interview as completed before sending offer.' });
    }
  }

  if (decision === 'rejected' && app.humanInterview?.status === 'scheduled') {
    return res.status(400).json({ error: 'Mark human panel interview as completed before final rejection.' });
  }

  const now = new Date();
  app.finalDecision = {
    decision,
    salary,
    startDate: String(req.body.start_date || '').trim(),
    message: String(req.body.message || '').trim(),
    offerResponse: decision === 'selected' ? 'pending' : undefined,
    offerRespondedAt: undefined,
    candidateNote: undefined,
    decidedBy: req.user.id,
    decidedByName: req.user.name,
    decidedAt: now,
  };
  app.status = decision === 'selected' ? 'offer_pending' : 'rejected';
  await app.save();

  if (decision === 'rejected') {
    await Candidate.updateOne({ id: app.candidateId }, { $set: { status: 'rejected' } });
  }

  const io = req.app.get('io');
  const emailResult = await notifyFinalDecision(app, io);

  const obj = app.toObject();
  delete obj.resumeData;
  res.json({
    ...obj,
    hasResume: hasStoredResume(app),
    email_queued: emailResult.email_queued,
    email_recipient: emailResult.recipient,
    employee_onboarded: false,
    message: decision === 'selected'
      ? `Offer recorded — letter email sending to ${emailResult.recipient || 'candidate'}`
      : `Decision recorded — email sending to ${emailResult.recipient || 'candidate'}`,
  });
});

router.post('/applications/:appId/offer-response', auth(['candidate']), async (req, res) => {
  const appId = parseInt(req.params.appId, 10);
  const candidate = await ensureCandidateForUser(req.user);
  const app = await JobApplication.findOne({
    id: appId,
    $or: [{ userId: req.user.id }, { candidateId: candidate.id }],
  });
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const response = String(req.body.response || '').trim().toLowerCase();
  if (!['accepted', 'rejected'].includes(response)) {
    return res.status(400).json({ error: 'response must be "accepted" or "rejected"' });
  }

  const fd = app.finalDecision || {};
  if (app.status === 'rejected' || fd.decision === 'rejected' || app.aiInterviewReview?.decision === 'rejected') {
    return res.status(400).json({ error: 'This application was rejected — no offer to respond to' });
  }
  if (fd.decision !== 'selected') {
    return res.status(400).json({ error: 'No offer available for this application' });
  }
  if (fd.offerResponse && fd.offerResponse !== 'pending') {
    return res.status(400).json({ error: `Offer already ${fd.offerResponse}` });
  }
  if (app.status !== 'offer_pending') {
    return res.status(400).json({ error: 'Offer is no longer pending' });
  }

  const candidateNote = String(req.body.message || req.body.note || '').trim();
  const now = new Date();
  app.finalDecision.offerResponse = response;
  app.finalDecision.offerRespondedAt = now;
  if (candidateNote) app.finalDecision.candidateNote = candidateNote;

  let onboardResult = null;
  const io = req.app.get('io');

  if (response === 'accepted') {
    app.status = 'hired';
    await app.save();
    await Candidate.updateOne({ id: app.candidateId }, { $set: { status: 'employee' } });
    const { onboardEmployeeFromApplication } = require('../lib/onboardEmployee');
    onboardResult = await onboardEmployeeFromApplication(app, {
      gender: String(req.body.gender || 'other').toLowerCase(),
      io,
    });
  } else {
    app.status = 'offer_declined';
    await app.save();
    await Candidate.updateOne({ id: app.candidateId }, { $set: { status: 'active' } });
  }

  const emailResult = await notifyOfferResponse(app, response, { candidateNote, onboardResult }, io);

  const obj = app.toObject();
  delete obj.resumeData;
  res.json({
    ...sanitizeApplication(obj),
    hasResume: hasStoredResume(app),
    hr_email_sent: emailResult.hrEmailSent,
    employee_onboarded: onboardResult?.created || false,
    employee_id: onboardResult?.employee?.id,
    leave_entitlements: onboardResult?.employee?.leaveEntitlements,
    message: response === 'accepted'
      ? (onboardResult?.employee
        ? `Offer accepted — you are now an employee (ID ${onboardResult.employee.id})`
        : 'Offer accepted — onboarding in progress')
      : 'Offer declined — HR has been notified',
  });
});

router.get('/:id/applications', auth(RECRUITER_ROLES), async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const job = await Job.findOne({ id: jobId }).lean();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const apps = await JobApplication.find({ jobId })
    .select('-resumeData')
    .sort({ appliedAt: -1 })
    .lean();
  res.json({ job: normalizeJob(job), applications: apps.map(sanitizeApplication) });
});

router.get('/:id', auth(), async (req, res) => {
  const job = await Job.findOne({ id: parseInt(req.params.id) }).lean();
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'candidate' && job.status !== 'open') {
    return res.status(404).json({ error: 'Not found' });
  }

  let applied = false;
  if (req.user.role === 'candidate') {
    const candidate = await Candidate.findOne({ email: req.user.email }).lean();
    if (candidate) {
      applied = !!(await JobApplication.findOne({ jobId: job.id, candidateId: candidate.id }));
    }
  }

  const applicant_count = await JobApplication.countDocuments({ jobId: job.id });
  res.json(normalizeJob({ ...job, applied, applicant_count }));
});

router.post('/:id/apply', auth(['candidate']), upload.single('resume'), async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const job = await Job.findOne({ id: jobId, status: 'open' }).lean();
  if (!job) return res.status(404).json({ error: 'Job not found or not yet published' });
  if (!req.file) return res.status(400).json({ error: 'Resume file (PDF/DOCX) is required' });

  const candidate = await ensureCandidateForUser(req.user);
  const existing = await JobApplication.findOne({ jobId, candidateId: candidate.id });
  if (existing) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'You have already applied to this job' });
  }

  try {
    const processed = await processCandidateApplication({
      file: req.file,
      job,
      user: req.user,
      body: req.body,
    });

    const application = await createJobApplicationRecord({
      job,
      user: req.user,
      candidate: processed.candidate,
      parsed: processed.parsed,
      screening: processed.screening,
      resumePath: processed.resumePath,
      resumeData: processed.resumeData,
      resumeFileName: processed.resumeFileName,
      resumeMimeType: processed.resumeMimeType,
      skills: processed.skills,
      coverNote: req.body.cover_note,
      highlightedSkills: processed.highlightedSkills,
    });

    const io = req.app.get('io');
    const shortlistResult = await finalizeApplicationAfterScreening(application, { io });

    const recruiters = await User.find({
      role: { $in: ['hr_recruiter', 'management_admin'] },
      isActive: { $ne: false },
    }).lean();
    const recruiterIds = [...new Set([
      ...recruiters.map((u) => u.id),
      job.createdBy,
    ].filter(Boolean))];

    const scoreLabel = Math.round(application.jdScore || 0);
    if (recruiterIds.length) await notifyUsers(recruiterIds, {
      type: shortlistResult.autoShortlisted ? 'auto_shortlisted' : 'new_application',
      title: shortlistResult.autoShortlisted
        ? `Auto-shortlisted — ${application.candidateName}`
        : 'New job application — review required',
      message: shortlistResult.autoShortlisted
        ? `${application.candidateName} scored ${scoreLabel}/100 on ${job.title} — auto-shortlisted. Schedule AI interview in Applications.`
        : `${application.candidateName} applied for ${job.title} — ${application.recommendation || 'Screened'} (${scoreLabel}/100). Review and shortlist in Applications.`,
      link: '/dashboard/applications',
      meta: {
        applicationId: application.id,
        jobId: job.id,
        candidateId: application.candidateId,
        jdScore: application.jdScore,
        autoShortlisted: shortlistResult.autoShortlisted,
      },
    }, io);

    if (!shortlistResult.autoShortlisted) {
      await notifyUsers([req.user.id], {
        type: 'application_submitted',
        title: 'Application submitted',
        message: `Your application for ${job.title} was received (${application.recommendation || 'screened'} — ${scoreLabel}/100). A recruiter will review your resume.`,
        link: '/dashboard/job-openings',
        meta: { applicationId: application.id, jobId: job.id, jdScore: application.jdScore },
      }, io);
    }

    const appObj = application.toObject();
    delete appObj.resumeData;
    res.status(201).json({
      message: shortlistResult.autoShortlisted
        ? `Application submitted — strong match ${scoreLabel}/100. Auto-shortlisted; HR will schedule your AI interview.`
        : `Application submitted — ${application.recommendation || 'Screened'} (${scoreLabel}/100). Awaiting HR shortlist.`,
      application: { ...appObj, hasResume: true },
      jd_score: application.jdScore,
      auto_shortlisted: shortlistResult.autoShortlisted,
      screening_rejected: false,
      screening: processed.screening,
      job: normalizeJob(job),
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('[apply] failed:', err.message, err.stack?.split('\n').slice(0, 3).join(' | '));
    const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.status === 504;
    const detail = err.message || err.response?.data?.detail || 'Application failed';
    const status = err.status
      || (err.name === 'ValidationError' ? 422 : null)
      || (err.response?.status === 422 ? 422 : null)
      || (err.response?.status === 503 ? 503 : null)
      || (isTimeout ? 504 : null)
      || 500;
    return res.status(status).json({
      error: isTimeout
        ? 'Resume analysis is taking longer than usual. Please wait a moment and try again.'
        : detail,
      hint: isTimeout
        ? 'Wake the ML service at /health on Render, then retry.'
        : detail.includes('ML') || detail.includes('Groq')
          ? 'Wake ML at /health and ensure GROQ_API_KEY is set on the ML service'
          : undefined,
    });
  }
});

router.post('/:id/approve', auth(RECRUITER_ROLES), async (req, res) => {
  const job = await Job.findOne({ id: parseInt(req.params.id, 10) });
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (job.status !== 'draft') {
    return res.status(400).json({ error: 'Only draft jobs awaiting approval can be published' });
  }

  const title = String(req.body.title || job.title || '').trim();
  const description = String(req.body.description || job.description || '').trim();
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required to publish' });
  }

  job.title = title;
  job.description = description;
  if (req.body.employment_type) job.employmentType = req.body.employment_type;
  if (req.body.department) job.department = req.body.department;
  job.status = 'open';
  job.approvedBy = req.user.id;
  job.approvedByName = req.user.name;
  job.approvedAt = new Date();
  await job.save();

  res.json(normalizeJob(job.toObject()));
});

router.post('/:id/reject-draft', auth(RECRUITER_ROLES), async (req, res) => {
  const job = await Job.findOne({ id: parseInt(req.params.id, 10) });
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (job.status !== 'draft') {
    return res.status(400).json({ error: 'Only draft jobs can be discarded' });
  }

  job.status = 'rejected';
  await job.save();
  res.json(normalizeJob(job.toObject()));
});

router.delete('/:id', auth(RECRUITER_ROLES), async (req, res) => {
  const job = await Job.findOne({ id: parseInt(req.params.id, 10) });
  if (!job) return res.status(404).json({ error: 'Not found' });

  if (job.status === 'draft') {
    job.status = 'rejected';
    await job.save();
    return res.json({ message: 'Draft discarded', job: normalizeJob(job.toObject()) });
  }

  if (job.status === 'open') {
    job.status = 'closed';
    await job.save();
    return res.json({ message: 'Job removed from openings', job: normalizeJob(job.toObject()) });
  }

  return res.status(400).json({ error: 'Only draft or published jobs can be deleted' });
});

router.post('/:id/analyze', auth(RECRUITER_ROLES), async (req, res) => {
  try {
    const job = await Job.findOne({ id: parseInt(req.params.id) });
    if (!job) return res.status(404).json({ error: 'Not found' });
    const analysis = await ml.analyzeJD(job.description, job.title);
    Object.assign(job, {
      skills: analysis.required_skills,
      experienceLevel: analysis.experience_level,
      interviewQuestions: [],
      difficultyLevel: analysis.difficulty_level,
      salaryInsights: analysis.salary_insights,
      generatedBy: 'groq',
    });
    await job.save();
    res.json(normalizeJob(job.toObject()));
  } catch (err) {
    res.status(err.status || err.response?.status || 500).json({
      error: err.message || 'Groq JD analysis failed.',
    });
  }
});

module.exports = router;
