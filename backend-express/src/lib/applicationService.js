const path = require('path');
const fs = require('fs');
const { Candidate, JobApplication, User, getNextSeq } = require('../models');
const ml = require('../services/mlClient');
const config = require('../config');
const { normalizeEmail } = require('./emailUtils');
const { stripHtml } = require('./emailContext');
const { SCREENING_PASS_THRESHOLD } = require('./interviewOutcome');
const { notifyUsers } = require('./notify');

/** Single combined ML call — parse + screen in one round trip (Render cold start). */
const APPLY_COMBINED_TIMEOUT_MS = 240000;
const MAX_RESUME_DB_BYTES = 3 * 1024 * 1024;

function buildJobContext(job) {
  const matrix = job.skillsMatrix || job.skills_matrix;
  const mustFromMatrix = (matrix?.must_have || [])
    .map((s) => (typeof s === 'string' ? s : s?.skill))
    .filter(Boolean);
  const niceFromMatrix = (matrix?.nice_to_have || [])
    .map((s) => (typeof s === 'string' ? s : s?.skill))
    .filter(Boolean);
  const skills = [
    ...(job.skills || job.required_skills || []),
    ...mustFromMatrix,
  ];
  return {
    job_title: job.title || '',
    job_description: stripHtml(job.description || '').slice(0, 8000),
    job_skills: [...new Set(skills)],
    job_nice_to_have: [
      ...new Set([
        ...(job.niceToHaveSkills || job.nice_to_have_skills || []),
        ...niceFromMatrix,
      ]),
    ],
    job_experience_level: job.experienceLevel || job.experience_level || '2 years',
  };
}

function guessResumeMimeType(originalName, mimetype) {
  if (mimetype) return mimetype;
  const ext = path.extname(originalName || '').toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/octet-stream';
}

function parseHighlightedSkills(body) {
  try {
    if (Array.isArray(body.highlighted_skills)) return body.highlighted_skills;
    if (body.highlighted_skills) return JSON.parse(body.highlighted_skills);
  } catch {
    // ignore
  }
  return [];
}

async function getOrCreateCandidate(user, parsed, manual = {}) {
  const accountEmail = normalizeEmail(user.email) || user.email;
  const resumeEmail = normalizeEmail(parsed?.email) || normalizeEmail(manual.email);

  let candidate = await Candidate.findOne({
    $or: [{ userId: user.id }, { email: accountEmail }],
  });

  if (!candidate) {
    const id = await getNextSeq('candidates');
    candidate = await Candidate.create({
      id,
      userId: user.id,
      name: manual.name || parsed?.name || user.name,
      email: accountEmail,
      contactEmail: resumeEmail && resumeEmail !== accountEmail ? resumeEmail : undefined,
      phone: manual.phone || parsed?.phone || '',
      status: 'applied',
      source: 'job_apply',
    });
  } else {
    candidate.userId = user.id;
    candidate.name = manual.name || parsed?.name || candidate.name || user.name;
    candidate.phone = manual.phone || parsed?.phone || candidate.phone || '';
    candidate.email = accountEmail;
    if (resumeEmail && resumeEmail !== accountEmail) {
      candidate.contactEmail = resumeEmail;
    }
    await candidate.save();
  }

  return candidate;
}

function trimScreeningForStorage(screening) {
  if (!screening || typeof screening !== 'object') return screening;
  const copy = { ...screening };
  delete copy.screening_result;
  delete copy.harness_profile;
  return copy;
}

function readResumeArtifacts(dest, originalName, mimetype) {
  const resumeBuffer = fs.readFileSync(dest);
  const resumeData = resumeBuffer.length <= MAX_RESUME_DB_BYTES ? resumeBuffer : undefined;
  if (!resumeData) {
    console.warn(`[apply] Resume ${resumeBuffer.length} bytes — stored on disk only (Mongo cap ${MAX_RESUME_DB_BYTES})`);
  }
  const ext = path.extname(originalName || '') || '.pdf';
  return {
    resumeData,
    resumeFileName: originalName || `resume${ext}`,
    resumeMimeType: guessResumeMimeType(originalName, mimetype),
  };
}

async function runMlParseAndScreen(resumePath, resumeFileName, job) {
  ml.wakeHealth().catch(() => {});
  const jobContext = buildJobContext(job);
  try {
    const { parsed, screening: rawScreening } = await ml.parseAndScreenResume(
      resumePath,
      resumeFileName,
      jobContext,
      { timeout: APPLY_COMBINED_TIMEOUT_MS },
    );
    return {
      parsed,
      screening: trimScreeningForStorage(rawScreening),
    };
  } catch (err) {
    const status = err.response?.status;
    const missingCombined = status === 404 || status === 405
      || String(err.message || '').includes('apply-process');
    if (!missingCombined) throw err;
    console.warn('[apply] /apply-process unavailable — falling back to parse + screen');
    const parsed = await ml.parseResume(resumePath, resumeFileName, {
      timeout: APPLY_COMBINED_TIMEOUT_MS,
    });
    const rawScreening = await ml.screenResume(parsed, jobContext, {
      timeout: APPLY_COMBINED_TIMEOUT_MS,
    });
    return {
      parsed,
      screening: trimScreeningForStorage(rawScreening),
    };
  }
}

/** Save resume + create pending application; respond to client before ML runs. */
async function stageApplicationForScreening({ file, job, user, body }) {
  const manualEmail = normalizeEmail(body.contact_email) || normalizeEmail(user.email);
  const candidate = await getOrCreateCandidate(user, {}, {
    name: body.name,
    phone: body.phone,
    email: manualEmail,
  });

  const ext = path.extname(file.originalname) || '.pdf';
  const dest = path.join(config.uploadDir, `apply_${candidate.id}_${job.id}${ext}`);
  fs.renameSync(file.path, dest);
  const { resumeData, resumeFileName, resumeMimeType } = readResumeArtifacts(
    dest,
    file.originalname,
    file.mimetype,
  );
  const highlightedSkills = parseHighlightedSkills(body);

  const application = await createPendingJobApplicationRecord({
    job,
    user,
    candidate,
    resumePath: dest,
    resumeData,
    resumeFileName,
    resumeMimeType,
    coverNote: body.cover_note,
    highlightedSkills,
    phone: body.phone,
  });

  return {
    application,
    candidate,
    resumePath: dest,
    resumeFileName,
    resumeMimeType,
    highlightedSkills,
    manualEmail,
  };
}

async function processCandidateApplication({ file, job, user, body }) {
  const { parsed, screening } = await runMlParseAndScreen(
    file.path,
    file.originalname || 'resume.pdf',
    job,
  );

  const manualEmail = normalizeEmail(body.contact_email) || normalizeEmail(user.email);
  if (!parsed.email && manualEmail) {
    parsed.email = manualEmail;
    parsed.email_source = 'profile';
  }

  const candidate = await getOrCreateCandidate(user, parsed, {
    name: body.name,
    phone: body.phone,
    email: manualEmail,
  });

  const ext = path.extname(file.originalname) || '.pdf';
  const dest = path.join(config.uploadDir, `apply_${candidate.id}_${job.id}${ext}`);
  fs.renameSync(file.path, dest);
  const { resumeData, resumeFileName, resumeMimeType } = readResumeArtifacts(
    dest,
    file.originalname,
    file.mimetype,
  );
  const highlightedSkills = parseHighlightedSkills(body);
  const mergedSkills = [...new Set([...(parsed.skills || []), ...highlightedSkills])];

  await Candidate.updateOne(
    { id: candidate.id },
    {
      $set: {
        jobId: job.id,
        name: candidate.name,
        phone: candidate.phone,
        resumePath: dest,
        skills: mergedSkills,
        experience: parsed.experience || [],
        education: parsed.education || [],
        matchScore: screening.ai_score,
        rankingScore: screening.ai_score,
        featureScores: screening.feature_scores,
        skillMatch: screening.skill_match,
        missingSkills: screening.missing_skills || [],
        extractedData: { ...parsed, screening, job_title: job.title },
        status: 'applied',
        source: 'job_apply',
      },
    },
  );

  return {
    candidate: await Candidate.findOne({ id: candidate.id }),
    parsed,
    screening,
    resumePath: dest,
    resumeData,
    resumeFileName,
    resumeMimeType,
    skills: mergedSkills,
    highlightedSkills,
  };
}

async function createPendingJobApplicationRecord({
  job, user, candidate, resumePath, resumeData, resumeFileName, resumeMimeType,
  coverNote, highlightedSkills, phone,
}) {
  const appId = await getNextSeq('jobapplications');
  return JobApplication.create({
    id: appId,
    jobId: job.id,
    candidateId: candidate.id,
    userId: user.id,
    candidateName: candidate.name,
    candidateEmail: candidate.email,
    jobTitle: job.title,
    coverNote: coverNote || '',
    phone: phone || candidate.phone || '',
    resumePath,
    resumeData,
    resumeFileName,
    resumeMimeType,
    skills: highlightedSkills || [],
    highlightedSkills: highlightedSkills || [],
    status: 'screening',
    appliedAt: new Date(),
  });
}

async function createJobApplicationRecord({
  job, user, candidate, parsed, screening, resumePath, resumeData, resumeFileName, resumeMimeType,
  skills, coverNote, highlightedSkills,
}) {
  const appId = await getNextSeq('jobapplications');
  return JobApplication.create({
    id: appId,
    jobId: job.id,
    candidateId: candidate.id,
    userId: user.id,
    candidateName: candidate.name,
    candidateEmail: candidate.email,
    jobTitle: job.title,
    coverNote: coverNote || '',
    phone: candidate.phone || parsed.phone || '',
    resumePath,
    resumeData,
    resumeFileName,
    resumeMimeType,
    skills,
    highlightedSkills: highlightedSkills || [],
    jdScore: screening.total_score ?? screening.ai_score,
    matchScore: screening.total_score ?? screening.ai_score,
    screening,
    parsedData: parsed,
    jdFitSummary: screening.decision_note || screening.jd_fit_summary || '',
    recommendation: screening.verdict || screening.recommendation || '',
    missingSkills: screening.key_gaps || screening.missing_skills || [],
    matchedSkills: screening.skill_match?.matched || screening.top_strengths || [],
    status: 'applied',
    appliedAt: new Date(),
  });
}

async function applyScreeningToApplication(application, {
  parsed, screening, candidate, highlightedSkills, job,
}) {
  const mergedSkills = [...new Set([...(parsed.skills || []), ...(highlightedSkills || [])])];

  application.status = 'applied';
  application.skills = mergedSkills;
  application.jdScore = screening.total_score ?? screening.ai_score;
  application.matchScore = screening.total_score ?? screening.ai_score;
  application.screening = screening;
  application.parsedData = parsed;
  application.jdFitSummary = screening.decision_note || screening.jd_fit_summary || '';
  application.recommendation = screening.verdict || screening.recommendation || '';
  application.missingSkills = screening.key_gaps || screening.missing_skills || [];
  application.matchedSkills = screening.skill_match?.matched || screening.top_strengths || [];
  application.phone = candidate.phone || parsed.phone || application.phone;
  application.candidateName = candidate.name || application.candidateName;
  await application.save();

  await Candidate.updateOne(
    { id: candidate.id },
    {
      $set: {
        jobId: job.id,
        name: candidate.name,
        phone: candidate.phone,
        resumePath: application.resumePath,
        skills: mergedSkills,
        experience: parsed.experience || [],
        education: parsed.education || [],
        matchScore: screening.ai_score,
        rankingScore: screening.ai_score,
        featureScores: screening.feature_scores,
        skillMatch: screening.skill_match,
        missingSkills: screening.missing_skills || [],
        extractedData: { ...parsed, screening, job_title: job.title },
        status: 'applied',
        source: 'job_apply',
      },
    },
  );

  return application;
}

/** Auto-shortlist when Groq screening score meets threshold (≥80%). */
async function finalizeApplicationAfterScreening(application, { io } = {}) {
  const score = Number(application.jdScore ?? application.matchScore ?? 0);
  if (score < SCREENING_PASS_THRESHOLD || application.status !== 'applied') {
    return { autoShortlisted: false, score };
  }

  application.status = 'shortlisted';
  application.autoShortlisted = true;
  application.autoShortlistedAt = new Date();
  await application.save();

  if (application.userId && io) {
    await notifyUsers([application.userId], {
      type: 'auto_shortlisted',
      title: `Shortlisted — ${application.jobTitle}`,
      message: `Strong resume match (${Math.round(score)}/100). HR may schedule your AI interview soon.`,
      link: '/dashboard/job-openings',
      meta: { applicationId: application.id, jobId: application.jobId, jdScore: score },
    }, io);
  }

  return { autoShortlisted: true, score };
}

async function notifyApplicationOutcome({
  application, job, user, shortlistResult, io,
}) {
  const recruiters = await User.find({
    role: { $in: ['hr_recruiter', 'management_admin'] },
    isActive: { $ne: false },
  }).lean();
  const recruiterIds = [...new Set([
    ...recruiters.map((u) => u.id),
    job.createdBy,
  ].filter(Boolean))];

  const scoreLabel = Math.round(application.jdScore || 0);
  if (recruiterIds.length) {
    await notifyUsers(recruiterIds, {
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
  }

  if (!shortlistResult.autoShortlisted) {
    await notifyUsers([user.id], {
      type: 'application_submitted',
      title: 'Application submitted',
      message: `Your application for ${job.title} was received (${application.recommendation || 'screened'} — ${scoreLabel}/100). A recruiter will review your resume.`,
      link: '/dashboard/job-openings',
      meta: { applicationId: application.id, jobId: job.id, jdScore: application.jdScore },
    }, io);
  }
}

async function completeApplicationScreening({
  applicationId, job, user, staged, io,
}) {
  const application = await JobApplication.findOne({ id: applicationId });
  if (!application || application.status !== 'screening') return null;

  const { parsed, screening } = await runMlParseAndScreen(
    staged.resumePath,
    staged.resumeFileName,
    job,
  );

  if (!parsed.email && staged.manualEmail) {
    parsed.email = staged.manualEmail;
    parsed.email_source = 'profile';
  }

  const candidate = await getOrCreateCandidate(user, parsed, {
    name: staged.application.candidateName || user.name,
    phone: staged.application.phone,
    email: staged.manualEmail,
  });

  await applyScreeningToApplication(application, {
    parsed,
    screening,
    candidate,
    highlightedSkills: staged.highlightedSkills,
    job,
  });

  const shortlistResult = await finalizeApplicationAfterScreening(application, { io });
  await notifyApplicationOutcome({
    application,
    job,
    user,
    shortlistResult,
    io,
  });

  return { application, screening, shortlistResult };
}

async function markApplicationScreeningFailed({ applicationId, user, job, errorMessage, io }) {
  const application = await JobApplication.findOne({ id: applicationId });
  if (!application || application.status !== 'screening') return;

  application.status = 'applied';
  application.recommendation = 'Screening delayed';
  application.jdFitSummary = 'AI screening could not finish automatically. A recruiter will review your resume manually.';
  application.screening = { error: errorMessage, escalate_to_human: true };
  await application.save();

  await notifyUsers([user.id], {
    type: 'application_submitted',
    title: 'Application received',
    message: `Your resume for ${job.title} was saved. AI screening is delayed — a recruiter will review it manually.`,
    link: '/dashboard/job-openings',
    meta: { applicationId: application.id, jobId: job.id },
  }, io);

  const recruiters = await User.find({
    role: { $in: ['hr_recruiter', 'management_admin'] },
    isActive: { $ne: false },
  }).lean();
  const recruiterIds = [...new Set([...recruiters.map((u) => u.id), job.createdBy].filter(Boolean))];
  if (recruiterIds.length) {
    await notifyUsers(recruiterIds, {
      type: 'new_application',
      title: 'Application needs manual screening',
      message: `${application.candidateName} applied for ${job.title} — AI screening failed (${errorMessage}). Review resume in Applications.`,
      link: '/dashboard/applications',
      meta: { applicationId: application.id, jobId: job.id, candidateId: application.candidateId },
    }, io);
  }
}

function runApplicationScreeningInBackground(params) {
  setImmediate(async () => {
    try {
      await completeApplicationScreening(params);
    } catch (err) {
      console.error('[apply:bg] screening failed:', err.message, err.stack?.split('\n').slice(0, 3).join(' | '));
      try {
        await markApplicationScreeningFailed({
          applicationId: params.applicationId,
          user: params.user,
          job: params.job,
          errorMessage: err.message || 'ML screening failed',
          io: params.io,
        });
      } catch (notifyErr) {
        console.error('[apply:bg] failure notify error:', notifyErr.message);
      }
    }
  });
}

module.exports = {
  processCandidateApplication,
  stageApplicationForScreening,
  completeApplicationScreening,
  runApplicationScreeningInBackground,
  createJobApplicationRecord,
  finalizeApplicationAfterScreening,
  notifyApplicationOutcome,
  normalizeEmail,
  SCREENING_AUTO_SHORTLIST_THRESHOLD: SCREENING_PASS_THRESHOLD,
};
