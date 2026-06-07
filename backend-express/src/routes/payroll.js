const express = require('express');
const { auth } = require('../middleware/auth');
const { Payroll, Employee, getNextSeq } = require('../models');
const { buildPayrollForEmployee, notifyPayrollEmail } = require('../lib/payrollService');
const { runEmailInBackground } = require('../lib/emailAsync');

const router = express.Router();

async function savePayrollRecord(employeeId, month, calc) {
  const id = await getNextSeq('payroll');
  return Payroll.findOneAndUpdate(
    { employeeId, month },
    {
      $set: {
        id,
        employeeId,
        month,
        basic: calc.basic,
        allowance: calc.allowance,
        bonus: calc.bonus,
        deductions: calc.deductions,
        tax: calc.tax,
        netPay: calc.net_pay,
        leaveDeduction: calc.leaveDeduction || 0,
        leaveBreakdown: calc.leaveBreakdown || [],
        anomalyFlag: calc.anomalyFlag,
        aiPrediction: { ...calc.aiPrediction, leaveBalances: calc.leaveBalances, monthLeaveDays: calc.monthLeaveDays },
      },
    },
    { upsert: true, new: true },
  );
}

router.get('/preview', auth(['management_admin', 'hr_recruiter']), async (req, res) => {
  const employeeId = parseInt(req.query.employee_id, 10);
  const month = String(req.query.month || '').trim();
  if (!employeeId || !month) {
    return res.status(400).json({ error: 'employee_id and month required' });
  }
  const emp = await Employee.findOne({ id: employeeId }).lean();
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const { buildPayrollForEmployee } = require('../lib/payrollService');
  const calc = await buildPayrollForEmployee(emp, {
    month,
    bonus: req.query.bonus,
    deductions: req.query.deductions,
  });
  const { getEmployeeLeaveSummary } = require('../lib/leaveService');
  const leaveSummary = await getEmployeeLeaveSummary(emp);
  res.json({ preview: calc, leaveSummary });
});

router.post('/generate', auth(['management_admin', 'hr_recruiter']), async (req, res) => {
  const employeeId = parseInt(req.body.employee_id, 10);
  const month = String(req.body.month || '').trim();
  if (!employeeId || !month) {
    return res.status(400).json({ error: 'employee_id and month are required' });
  }

  const emp = await Employee.findOne({ id: employeeId }).lean();
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  if (!emp.salary?.basic) {
    return res.status(400).json({ error: 'Employee has no salary structure. Set basic salary when creating the employee.' });
  }

  try {
    const calc = await buildPayrollForEmployee(emp, {
      month,
      bonus: req.body.bonus,
      deductions: req.body.deductions,
    });
    const payroll = await savePayrollRecord(employeeId, month, calc);
    const payrollPayload = { ...payroll.toObject(), month };
    const recipient = emp.personalDetails?.email || null;
    if (recipient) {
      runEmailInBackground(
        () => notifyPayrollEmail(emp, payrollPayload),
        `payroll-${emp.id}-${month}`,
      );
    }

    const obj = payroll.toObject();
    res.json({
      ...obj,
      email_sent: null,
      email_queued: Boolean(recipient),
      email_recipient: recipient,
      message: recipient
        ? `Payroll saved — Groq payslip email sending to ${recipient}`
        : 'Payroll saved — employee has no email on file',
    });
  } catch (err) {
    console.error('[payroll] generate failed:', err.message);
    res.status(500).json({ error: err.message || 'Payroll generation failed' });
  }
});

router.post('/generate-batch', auth(['management_admin', 'hr_recruiter']), async (req, res) => {
  const month = String(req.body.month || '').trim();
  if (!month) return res.status(400).json({ error: 'month is required' });

  const employees = await Employee.find({ status: 'active', 'salary.basic': { $gt: 0 } }).lean();
  if (!employees.length) {
    return res.status(400).json({ error: 'No active employees with salary configured' });
  }

  const results = [];
  const errors = [];
  for (const emp of employees) {
    try {
      const calc = await buildPayrollForEmployee(emp, {
        month,
        bonus: req.body.bonus || 0,
        deductions: req.body.deductions || 0,
      });
      const payroll = await savePayrollRecord(emp.id, month, calc);
      const payrollPayload = { ...payroll.toObject(), month };
      if (emp.personalDetails?.email) {
        runEmailInBackground(
          () => notifyPayrollEmail(emp, payrollPayload),
          `payroll-${emp.id}-${month}`,
        );
      }
      results.push({
        employeeId: emp.id,
        name: emp.personalDetails?.name,
        email: emp.personalDetails?.email,
        netPay: payroll.netPay,
        email_queued: Boolean(emp.personalDetails?.email),
      });
    } catch (err) {
      errors.push({ employeeId: emp.id, name: emp.personalDetails?.name, error: err.message });
    }
  }

  const emailed = results.filter((r) => r.email_sent).length;
  res.json({
    month,
    total: results.length,
    failed: errors.length,
    errors,
    emails_sent: emailed,
    results,
    message: errors.length
      ? `Generated ${results.length} payroll(s), ${errors.length} failed — ${emailed} email(s) sent`
      : `Generated payroll for ${results.length} employees — ${emailed} payslip email(s) sent`,
  });
});

router.get('/', auth(['management_admin', 'hr_recruiter', 'senior_manager']), async (req, res) => {
  const filter = req.query.month ? { month: req.query.month } : {};
  const rows = await Payroll.find(filter).sort({ createdAt: -1 }).lean();
  const empIds = [...new Set(rows.map((r) => r.employeeId))];
  const employees = await Employee.find({ id: { $in: empIds } }).lean();
  const empMap = Object.fromEntries(employees.map((e) => [e.id, e]));
  res.json(rows.map((r) => ({
    ...r,
    employeeName: empMap[r.employeeId]?.personalDetails?.name,
    employeeEmail: empMap[r.employeeId]?.personalDetails?.email,
  })));
});

router.get('/my', auth(['employee']), async (req, res) => {
  const emp = await Employee.findOne({
    $or: [
      { 'personalDetails.email': req.user.email },
      { userId: req.user.id },
    ],
  }).lean();
  if (!emp) return res.json([]);
  res.json(await Payroll.find({ employeeId: emp.id }).sort({ month: -1 }).lean());
});

router.get('/payslip/:id', auth(), async (req, res) => {
  const p = await Payroll.findOne({ id: parseInt(req.params.id, 10) }).lean();
  if (!p) return res.status(404).json({ error: 'Not found' });
  const emp = await Employee.findOne({ id: p.employeeId }).lean();
  if (req.user.role === 'employee') {
    const mine = emp && (
      emp.userId === req.user.id
      || emp.personalDetails?.email?.toLowerCase() === req.user.email?.toLowerCase()
    );
    if (!mine) return res.status(403).json({ error: 'Access denied' });
  }
  const otherDed = Math.max(0, Number(p.deductions || 0) - Number(p.leaveDeduction || 0));
  res.json({
    ...p,
    payslip: {
      employee: emp?.personalDetails?.name,
      employeeEmail: emp?.personalDetails?.email,
      employeeId: emp?.employeeId,
      department: emp?.department,
      designation: emp?.designation,
      earnings: { basic: p.basic, allowance: p.allowance, bonus: p.bonus },
      deductions: { tax: p.tax, leave: p.leaveDeduction || 0, other: otherDed, total: Number(p.deductions || 0) + Number(p.tax || 0) },
      netPay: p.netPay,
      month: p.month,
      leaveBreakdown: p.leaveBreakdown || [],
    },
  });
});

router.get('/payslip/:id/pdf', auth(), async (req, res) => {
  const p = await Payroll.findOne({ id: parseInt(req.params.id, 10) }).lean();
  if (!p) return res.status(404).json({ error: 'Not found' });
  const emp = await Employee.findOne({ id: p.employeeId }).lean();
  if (req.user.role === 'employee') {
    const mine = emp && (
      emp.userId === req.user.id
      || emp.personalDetails?.email?.toLowerCase() === req.user.email?.toLowerCase()
    );
    if (!mine) return res.status(403).json({ error: 'Access denied' });
  }
  const { buildPayslipPdf } = require('../lib/payslipPdf');
  const pdf = await buildPayslipPdf({ employee: emp, payroll: p });
  const filename = `Payslip_${emp?.employeeId || p.employeeId}_${p.month}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(pdf);
});

module.exports = router;
