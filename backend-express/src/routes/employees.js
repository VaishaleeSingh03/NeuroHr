const express = require('express');
const { auth } = require('../middleware/auth');
const { Employee, getNextSeq } = require('../models');
const { linkUserAsEmployee, notifyHrNewEmployee } = require('../lib/employeeLink');
const { RECRUITER_ROLES } = require('../lib/roles');
const { formatEmployeeForRoster } = require('../lib/panelRosterSeed');
const { isCalendarConfigured } = require('../lib/googleCalendar');
const ml = require('../services/mlClient');
const { suggestEmployeeSalary } = require('../lib/payrollService');
const { buildLeaveEntitlements, currentYear } = require('../lib/leavePolicy');

const router = express.Router();

router.get('/panel-roster', auth(RECRUITER_ROLES), async (req, res) => {
  const items = await Employee.find({ status: 'active' })
    .sort({ department: 1, designation: 1 })
    .limit(200)
    .lean();
  res.json({
    calendar_configured: isCalendarConfigured(),
    employees: items.map(formatEmployeeForRoster).filter((e) => e.email),
  });
});

router.post('/panel-roster', auth(RECRUITER_ROLES), async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const designation = String(req.body.designation || req.body.role || '').trim() || 'Panel Member';
  const department = String(req.body.department || '').trim() || 'Engineering';
  if (!name || !email.includes('@')) {
    return res.status(400).json({ error: 'name and valid email are required' });
  }
  const existing = await Employee.findOne({ 'personalDetails.email': email }).lean();
  if (existing) {
    return res.json(formatEmployeeForRoster(existing));
  }
  const id = await getNextSeq('employees');
  const emp = await Employee.create({
    id,
    employeeId: `EMP${String(id).padStart(5, '0')}`,
    personalDetails: { name, email, phone: req.body.phone || '' },
    department,
    designation,
    skills: Array.isArray(req.body.skills) ? req.body.skills : [],
    salary: { basic: 0, allowance: 0, bonus: 0 },
    status: 'active',
  });
  res.status(201).json(formatEmployeeForRoster(emp.toObject()));
});

router.get('/', auth(['management_admin', 'senior_manager', 'hr_recruiter']), async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
  const filter = {};
  if (req.query.department) filter.department = req.query.department;
  if (req.user.role === 'senior_manager') filter.managerId = req.user.id;
  const [items, total] = await Promise.all([
    Employee.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Employee.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

router.post('/suggest-salary', auth(['management_admin', 'hr_recruiter']), async (req, res) => {
  const suggestion = await suggestEmployeeSalary({
    name: req.body.name,
    designation: req.body.designation,
    department: req.body.department,
    skills: req.body.skills || [],
  });
  res.json(suggestion);
});

router.get('/:id', auth(), async (req, res) => {
  const emp = await Employee.findOne({ id: parseInt(req.params.id, 10) }).lean();
  if (!emp) return res.status(404).json({ error: 'Not found' });
  res.json(emp);
});

router.post('/', auth(['management_admin', 'hr_recruiter']), async (req, res) => {
  const id = await getNextSeq('employees');
  const empId = `EMP${String(id).padStart(5, '0')}`;
  const skills = req.body.skills || [];
  let salary = req.body.salary;

  const hasSalary = salary && Number(salary.basic) > 0;
  if (!hasSalary && req.body.ai_salary !== false) {
    const suggestion = await suggestEmployeeSalary({
      name: req.body.name,
      designation: req.body.designation,
      department: req.body.department,
      skills,
    });
    salary = {
      basic: suggestion.basic,
      allowance: suggestion.allowance,
      bonus: suggestion.bonus || 0,
      currency: suggestion.currency || 'INR',
      aiSuggested: true,
      aiNotes: suggestion.notes,
      generatedBy: suggestion.generated_by,
    };
  }

  const employmentType = req.body.employment_type || req.body.employmentType || 'full_time';
  const gender = req.body.gender || 'other';
  const year = currentYear();

  const email = String(req.body.email || '').trim().toLowerCase();

  const emp = await Employee.create({
    id,
    employeeId: empId,
    personalDetails: { name: req.body.name, email, phone: req.body.phone },
    department: req.body.department,
    designation: req.body.designation,
    managerId: req.body.managerId,
    skills,
    salary: salary || { basic: 0, allowance: 0, bonus: 0 },
    employmentType,
    gender,
    leaveEntitlements: buildLeaveEntitlements({ employmentType, gender, year }),
    leaveUsed: { year, sick: 0, casual: 0, unpaid: 0, additional: 0, maternity: 0, medical_full: 0, medical_half: 0 },
    status: 'active',
    hiredAt: new Date(),
  });

  const linked = await linkUserAsEmployee(email, emp.id);
  if (linked?.id) {
    await Employee.updateOne({ id: emp.id }, { $set: { userId: linked.id } });
    emp.userId = linked.id;
  }
  await notifyHrNewEmployee(emp.toObject(), req.app.get('io'), req.user.name);
  res.status(201).json(emp);
});

router.put('/:id', auth(['management_admin', 'hr_recruiter']), async (req, res) => {
  const emp = await Employee.findOneAndUpdate(
    { id: parseInt(req.params.id) },
    { $set: req.body },
    { new: true }
  );
  if (!emp) return res.status(404).json({ error: 'Not found' });
  res.json(emp);
});

router.post('/:id/ai-insights', auth(['management_admin', 'senior_manager']), async (req, res) => {
  const emp = await Employee.findOne({ id: parseInt(req.params.id) }).lean();
  if (!emp) return res.status(404).json({ error: 'Not found' });
  try {
    const insights = await ml.predictPerformance(emp);
    await Employee.updateOne({ id: emp.id }, { $set: { aiPerformanceScore: insights.performance_score || 0 } });
    res.json(insights);
  } catch {
    res.json({ performance_score: emp.aiPerformanceScore || 75, skill_recommendations: emp.skills, growth_analysis: 'Steady growth trajectory' });
  }
});

router.post('/:id/promote', auth(['management_admin', 'senior_manager']), async (req, res) => {
  const emp = await Employee.findOneAndUpdate(
    { id: parseInt(req.params.id) },
    { $set: { designation: req.body.designation, 'salary.basic': req.body.salary } },
    { new: true }
  );
  res.json(emp);
});

module.exports = router;
