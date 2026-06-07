const express = require('express');

const multer = require('multer');

const path = require('path');

const fs = require('fs');

const { auth } = require('../middleware/auth');

const { Candidate, Job, getNextSeq } = require('../models');

const ml = require('../services/mlClient');

const config = require('../config');
const { normalizeEmail } = require('../lib/emailUtils');



const upload = multer({ dest: config.uploadDir });

const router = express.Router();



function buildJobContext(job) {
  if (!job) return { job_description: '', job_title: '', job_skills: [] };

  const matrix = job.skillsMatrix || job.skills_matrix;
  const mustFromMatrix = (matrix?.must_have || [])
    .map((s) => (typeof s === 'string' ? s : s?.skill))
    .filter(Boolean);
  const niceFromMatrix = (matrix?.nice_to_have || [])
    .map((s) => (typeof s === 'string' ? s : s?.skill))
    .filter(Boolean);
  const skills = [...new Set([...(job.skills || job.required_skills || []), ...mustFromMatrix])];

  return {
    job_title: job.title || '',
    job_description: job.description || '',
    job_skills: skills,
    job_nice_to_have: [...new Set([
      ...(job.niceToHaveSkills || job.nice_to_have_skills || []),
      ...niceFromMatrix,
    ])],
    job_experience_level: job.experienceLevel || job.experience_level || '2 years',
  };
}





async function processResumeFile(file, job, options = {}) {

  const parsed = await ml.parseResume(file.path, file.originalname);

  const ctx = buildJobContext(job);

  const screening = await ml.screenResume(parsed, ctx);



  let email = normalizeEmail(parsed.email);

  const manualEmail = normalizeEmail(options.contactEmail);

  if (!email && manualEmail) {

    email = manualEmail;

    parsed.email = manualEmail;

    parsed.email_source = 'manual';

  }

  if (!email) {

    const err = new Error(
      'No email found in resume. Enter the candidate email in the field below, '
      + 'or add a clear email in the resume contact section (e.g. name@gmail.com).'
    );

    err.status = 422;

    throw err;

  }



  const id = await getNextSeq('candidates');

  const ext = path.extname(file.originalname) || '.pdf';

  const dest = path.join(config.uploadDir, `resume_${id}${ext}`);

  fs.renameSync(file.path, dest);



  const candidate = await Candidate.create({

    id,

    name: parsed.name || 'Unknown',

    email,

    phone: parsed.phone || '',

    jobId: job.id,

    resumePath: dest,

    extractedData: {

      ...parsed,

      screening,

      job_title: job.title,

    },

    skills: parsed.skills || [],

    experience: parsed.experience || [],

    education: parsed.education || [],

    matchScore: screening.ai_score,

    rankingScore: screening.ai_score,

    featureScores: screening.feature_scores,

    skillMatch: screening.skill_match,

    missingSkills: screening.missing_skills || [],

    status: 'screening',

    source: 'resume_upload',

  });



  return {

    candidate,

    parsed,

    screening,

  };

}



router.post('/upload', auth(['hr_recruiter', 'management_admin']), upload.single('file'), async (req, res) => {

  const job = await Job.findOne({ id: parseInt(req.body.job_id) });

  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (!req.file) return res.status(400).json({ error: 'Resume file is required' });



  try {

    const { candidate, parsed, screening } = await processResumeFile(req.file, job, {
      contactEmail: req.body.contact_email,
    });

    res.json({

      ...candidate.toObject(),

      parsed,

      screening,

      jd_fit_summary: screening.jd_fit_summary,

      recommendation: screening.recommendation,

    });

  } catch (err) {

    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    const status = err.status || (err.response?.status === 422 ? 422 : 500);
    const detail = err.message || err.response?.data?.detail || 'Resume parsing failed';
    const message = typeof detail === 'string' ? detail : JSON.stringify(detail);
    return res.status(status).json({ error: message });

  }

});



router.post('/bulk-upload', auth(['hr_recruiter', 'management_admin']), upload.array('files', 1000), async (req, res) => {

  const job = await Job.findOne({ id: parseInt(req.body.job_id) });

  if (!job) return res.status(404).json({ error: 'Job not found' });



  const candidates = [];

  const errors = [];



  for (const file of req.files || []) {

    try {

      const { candidate } = await processResumeFile(file, job, {
        contactEmail: req.body.contact_email,
      });

      candidates.push(candidate);

    } catch (err) {

      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);

      errors.push({ file: file.originalname, error: err.response?.data?.detail || err.message });

    }

  }



  candidates.sort((a, b) => b.rankingScore - a.rankingScore);

  res.json({

    total_processed: candidates.length,

    total_failed: errors.length,

    errors,

    candidates,

    rankings: candidates.map((c, i) => ({

      rank: i + 1,

      name: c.name,

      ai_score: c.rankingScore,

      id: c.id,

    })),

  });

});



router.get('/candidates', auth(['hr_recruiter', 'management_admin', 'senior_manager']), async (req, res) => {

  const filter = {};

  if (req.query.job_id) filter.jobId = parseInt(req.query.job_id);

  if (req.query.uploaded_only === 'true') {

    filter.source = 'resume_upload';

  }

  const page = parseInt(req.query.page || '1', 10);

  const limit = parseInt(req.query.limit || '50', 10);

  const items = await Candidate.find(filter).sort({ rankingScore: -1 }).skip((page - 1) * limit).limit(limit).lean();

  res.json(items);

});



router.get('/candidates/:id', auth(), async (req, res) => {

  const c = await Candidate.findOne({ id: parseInt(req.params.id) }).lean();

  if (!c) return res.status(404).json({ error: 'Not found' });

  res.json(c);

});



module.exports = router;

