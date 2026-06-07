const path = require('path');
const fs = require('fs');
const { Candidate, JobApplication, getNextSeq } = require('../models');
const ml = require('../services/mlClient');
const config = require('../config');
const { normalizeEmail } = require('./emailUtils');
const { stripHtml } = require('./emailContext');
const { SCREENING_PASS_THRESHOLD } = require('./interviewOutcome');
const { notifyUsers } = require('./notify');

/** Render cold-start + Groq screening can exceed 22s — keep ML calls alive on deploy. */
const APPLY_PARSE_TIMEOUT_MS = 120000;
const APPLY_SCREEN_TIMEOUT_MS = 120000;
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

async function processCandidateApplication({ file, job, user, body }) {
  const parsed = await ml.parseResume(file.path, file.originalname, { timeout: APPLY_PARSE_TIMEOUT_MS });
  let screening = await ml.screenResume(parsed, buildJobContext(job), { timeout: APPLY_SCREEN_TIMEOUT_MS });
  screening = trimScreeningForStorage(screening);

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
  const resumeBuffer = fs.readFileSync(dest);
  const resumeData = resumeBuffer.length <= MAX_RESUME_DB_BYTES ? resumeBuffer : undefined;
  if (!resumeData) {
    console.warn(`[apply] Resume ${resumeBuffer.length} bytes — stored on disk only (Mongo cap ${MAX_RESUME_DB_BYTES})`);
  }
  const resumeFileName = file.originalname || `resume${ext}`;
  const resumeMimeType = guessResumeMimeType(resumeFileName, file.mimetype);

  let highlighted = [];
  try {
    if (Array.isArray(body.highlighted_skills)) highlighted = body.highlighted_skills;
    else if (body.highlighted_skills) highlighted = JSON.parse(body.highlighted_skills);
  } catch {
    highlighted = [];
  }

  const mergedSkills = [...new Set([...(parsed.skills || []), ...highlighted])];

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
    }
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
    highlightedSkills: highlighted,
  };
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

module.exports = {
  processCandidateApplication,
  createJobApplicationRecord,
  finalizeApplicationAfterScreening,
  normalizeEmail,
  SCREENING_AUTO_SHORTLIST_THRESHOLD: SCREENING_PASS_THRESHOLD,
};
