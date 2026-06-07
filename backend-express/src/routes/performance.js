const express = require('express');
const { auth } = require('../middleware/auth');
const { Performance, Employee, getNextSeq } = require('../models');
const ml = require('../services/mlClient');

const router = express.Router();

router.get('/', auth(['management_admin', 'senior_manager']), async (req, res) => {
  const filter = req.query.employee_id ? { employeeId: parseInt(req.query.employee_id) } : {};
  res.json(await Performance.find(filter).sort({ createdAt: -1 }).lean());
});

router.get('/my', auth(['employee']), async (req, res) => {
  const emp = await Employee.findOne({ 'personalDetails.email': req.user.email }).lean();
  if (!emp) return res.json(null);
  const perf = await Performance.findOne({ employeeId: emp.id }).sort({ createdAt: -1 }).lean();
  res.json(perf);
});

router.post('/', auth(['senior_manager', 'management_admin']), async (req, res) => {
  const id = await getNextSeq('performance');
  let ai = { performance_score: 75, promotion_chance: 60, attrition_risk: 20 };
  try { ai = await ml.predictPerformance(req.body); } catch { /* fallback */ }
  const perf = await Performance.create({
    id, employeeId: req.body.employee_id,
    tasks: req.body.tasks || [], goals: req.body.goals || [],
    kpis: req.body.kpis || [], feedback: req.body.feedback || [],
    projects: req.body.projects || [], period: req.body.period || 'Q1',
    aiScore: ai.performance_score, promotionChance: ai.promotion_chance, attritionRisk: ai.attrition_risk,
  });
  res.status(201).json(perf);
});

router.put('/:id', auth(['senior_manager', 'management_admin']), async (req, res) => {
  const perf = await Performance.findOneAndUpdate({ id: parseInt(req.params.id) }, { $set: req.body }, { new: true });
  res.json(perf);
});

module.exports = router;
