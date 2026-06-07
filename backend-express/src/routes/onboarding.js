const express = require('express');
const { auth } = require('../middleware/auth');
const { Onboarding, Candidate, getNextSeq } = require('../models');
const ml = require('../services/mlClient');

const router = express.Router();

router.post('/generate', auth(['hr_recruiter', 'management_admin']), async (req, res) => {
  const candidate = await Candidate.findOne({ id: req.body.candidate_id }).lean();
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  const plan = await ml.generateOnboarding({
    name: candidate.name,
    skills: candidate.skills || [],
    department: req.body.department || 'Engineering',
    start_date: req.body.start_date || new Date().toISOString().split('T')[0],
  }, req.body.job_title || req.body.position || 'Position');
  const id = await getNextSeq('onboarding');
  const onboarding = await Onboarding.create({
    id, candidateId: candidate.id,
    offerLetter: plan.offer_letter,
    joiningChecklist: plan.documents_checklist,
    trainingPlan: plan.training_roadmap,
    day30Plan: plan.plan_30, day60Plan: plan.plan_60, day90Plan: plan.plan_90,
    documentation: plan.documents_checklist,
    status: 'draft',
  });
  await Candidate.updateOne({ id: candidate.id }, { $set: { status: 'onboarding' } });
  res.status(201).json(onboarding);
});

router.get('/', auth(['hr_recruiter', 'management_admin']), async (req, res) => {
  res.json(await Onboarding.find().sort({ createdAt: -1 }).lean());
});

router.get('/:id', auth(), async (req, res) => {
  const o = await Onboarding.findOne({ id: parseInt(req.params.id) }).lean();
  if (!o) return res.status(404).json({ error: 'Not found' });
  res.json(o);
});

module.exports = router;
