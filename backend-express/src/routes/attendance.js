const express = require('express');
const { auth } = require('../middleware/auth');
const { Attendance, Leave, Employee, getNextSeq } = require('../models');
const { CHECK_IN_ROLES, ATTENDANCE_VIEW_ROLES, LEAVE_APPROVER_ROLES } = require('../lib/roles');
const {
  validateAndCreateLeave, getEmployeeLeaveSummary, countDays,
} = require('../lib/leaveService');
const { normalizeLeaveType } = require('../lib/leavePolicy');

const router = express.Router();

function today() { return new Date().toISOString().split('T')[0]; }
function nowTime() { return new Date().toTimeString().slice(0, 8); }

async function resolveEmployee(req) {
  return Employee.findOne({
    $or: [
      { 'personalDetails.email': req.user.email },
      { userId: req.user.id },
    ],
  }).lean();
}

router.post('/check-in', auth(CHECK_IN_ROLES), async (req, res) => {
  const emp = await resolveEmployee(req);
  const employeeId = emp?.id || req.user.id;
  const id = await getNextSeq('attendance');
  const record = await Attendance.findOneAndUpdate(
    { employeeId, date: today() },
    {
      $setOnInsert: { id, employeeId, date: today() },
      $set: { checkIn: nowTime(), status: 'present' },
    },
    { upsert: true, new: true },
  );
  res.json(record);
});

router.post('/check-out', auth(), async (req, res) => {
  const emp = await resolveEmployee(req);
  const employeeId = emp?.id || req.user.id;
  const record = await Attendance.findOne({ employeeId, date: today() });
  if (!record) return res.status(404).json({ error: 'No check-in today' });
  record.checkOut = nowTime();
  const [ih, im] = (record.checkIn || '09:00:00').split(':').map(Number);
  const [oh, om] = record.checkOut.split(':').map(Number);
  record.workingHours = Math.max(0, (oh + om / 60) - (ih + im / 60));
  await record.save();
  res.json(record);
});

router.get('/', auth(ATTENDANCE_VIEW_ROLES), async (req, res) => {
  const filter = {};
  if (req.query.employee_id) filter.employeeId = parseInt(req.query.employee_id, 10);
  if (req.query.date) filter.date = req.query.date;
  const records = await Attendance.find(filter).sort({ date: -1 }).limit(500).lean();
  const empIds = [...new Set(records.map((r) => r.employeeId))];
  const employees = await Employee.find({ id: { $in: empIds } }).lean();
  const empMap = Object.fromEntries(employees.map((e) => [e.id, e]));
  res.json(records.map((r) => ({
    ...r,
    employeeName: empMap[r.employeeId]?.personalDetails?.name || `Employee #${r.employeeId}`,
    employeeEmail: empMap[r.employeeId]?.personalDetails?.email,
    employeeCode: empMap[r.employeeId]?.employeeId,
    department: empMap[r.employeeId]?.department,
  })));
});

router.get('/my', auth(), async (req, res) => {
  const emp = await resolveEmployee(req);
  const employeeId = emp?.id || req.user.id;
  res.json(await Attendance.find({ employeeId }).sort({ date: -1 }).limit(30).lean());
});

router.get('/leave-balances', auth(LEAVE_APPROVER_ROLES), async (req, res) => {
  const employees = await Employee.find({ status: 'active' }).lean();
  const summaries = await Promise.all(employees.map((e) => getEmployeeLeaveSummary(e)));
  res.json({ total: summaries.length, employees: summaries });
});

router.get('/leave-summary/:employeeId', auth(LEAVE_APPROVER_ROLES), async (req, res) => {
  const emp = await Employee.findOne({ id: parseInt(req.params.employeeId, 10) }).lean();
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  res.json(await getEmployeeLeaveSummary(emp));
});

router.post('/leave', auth(), async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'Employee profile not found' });

  const leaveType = normalizeLeaveType(req.body.type);
  if (!leaveType) return res.status(400).json({ error: 'Invalid leave type' });

  const check = await validateAndCreateLeave(emp, {
    type: leaveType,
    from_date: req.body.from_date,
    to_date: req.body.to_date,
  });
  if (check.error) return res.status(400).json({ error: check.error });

  const id = await getNextSeq('leaves');
  const leave = await Leave.create({
    id,
    employeeId: emp.id,
    type: leaveType,
    fromDate: req.body.from_date,
    toDate: req.body.to_date,
    days: check.days,
    year: check.year,
    reason: req.body.reason,
    status: 'pending',
  });

  const config = require('../config');
  const { sendAgentEmail } = require('../lib/emailService');
  const { leaveRequestHrNotice } = require('../lib/emailTemplates');
  const { stripHtml } = require('../lib/emailContext');
  const hrEmail = config.hrEmail;
  let emailResult = { sent: false };

  if (hrEmail) {
    try {
      const leaveSummary = await getEmployeeLeaveSummary(emp);
      const balanceSummary = Object.entries(leaveSummary.balances || {})
        .filter(([, v]) => v && v.granted > 0)
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v.remaining}/${v.granted}`)
        .join(', ');
      const { subject, html } = leaveRequestHrNotice({
        name: emp.personalDetails?.name || 'Employee',
        employeeId: emp.employeeId || `EMP${emp.id}`,
        department: emp.department,
        designation: emp.designation,
        employmentType: emp.employmentType,
        email: emp.personalDetails?.email,
        leaveType: leaveType,
        fromDate: leave.fromDate,
        toDate: leave.toDate,
        days: leave.days,
        reason: stripHtml(leave.reason || ''),
        requestId: leave.id,
        balanceSummary,
        exceedsBalance: check.exceedsBalance,
      });
      const sent = await sendAgentEmail(hrEmail, subject, html);
      emailResult = { ...sent, sent: true, generated_by: 'template' };
    } catch (err) {
      console.error('[leave] HR notification failed:', err.message);
      emailResult = { sent: false, reason: err.message };
    }
  } else {
    emailResult = { sent: false, reason: 'no_hr_email_configured' };
  }

  res.status(201).json({
    ...leave.toObject(),
    email_sent: emailResult.sent,
    exceedsBalance: check.exceedsBalance,
    warning: check.exceedsBalance ? 'This request exceeds your remaining balance — excess days may be deducted from payroll' : undefined,
    message: emailResult.sent
      ? 'Leave request submitted — HR notified by email'
      : `Leave request submitted but HR email failed${emailResult.reason ? `: ${emailResult.reason}` : ''}`,
  });
});

router.patch('/leave/:id/approve', auth(LEAVE_APPROVER_ROLES), async (req, res) => {
  const leave = await Leave.findOne({ id: parseInt(req.params.id, 10) });
  if (!leave) return res.status(404).json({ error: 'Leave not found' });
  const emp = await Employee.findOne({ id: leave.employeeId }).lean();
  if (emp) {
    const check = await validateAndCreateLeave(emp, {
      type: leave.type,
      from_date: leave.fromDate,
      to_date: leave.toDate,
    });
    if (check.error) return res.status(400).json({ error: check.error });
  }
  const updated = await Leave.findOneAndUpdate(
    { id: leave.id },
    { $set: { status: 'approved', approvedBy: req.user.id, days: leave.days || countDays(leave.fromDate, leave.toDate) } },
    { new: true },
  );
  res.json(updated);
});

router.get('/leaves', auth(), async (req, res) => {
  let filter = {};
  if (req.user.role === 'employee') {
    const emp = await resolveEmployee(req);
    if (emp) filter.employeeId = emp.id;
  } else if (req.query.employee_id) {
    filter.employeeId = parseInt(req.query.employee_id, 10);
  }
  const leaves = await Leave.find(filter).sort({ createdAt: -1 }).lean();
  const empIds = [...new Set(leaves.map((l) => l.employeeId))];
  const employees = await Employee.find({ id: { $in: empIds } }).lean();
  const nameMap = Object.fromEntries(employees.map((e) => [e.id, e.personalDetails?.name]));
  res.json(leaves.map((l) => ({ ...l, employeeName: nameMap[l.employeeId] })));
});

module.exports = router;
