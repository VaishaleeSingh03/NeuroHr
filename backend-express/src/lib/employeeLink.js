const { User, Employee, Candidate } = require('../models');
const { notifyUsers } = require('./notify');

async function linkUserAsEmployee(email, employeeRecordId) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  const user = await User.findOne({ email: normalized }).lean();
  if (!user) return null;

  await User.updateOne({ id: user.id }, { $set: { role: 'employee' } });
  await Employee.updateOne({ id: employeeRecordId }, { $set: { userId: user.id } });
  return { ...user, role: 'employee' };
}

async function markCandidateAsEmployee(candidateId, employeeRecordId) {
  if (!candidateId) return;
  await Candidate.updateOne(
    { id: candidateId },
    { $set: { status: 'employee', employeeId: employeeRecordId } },
  );
}

async function notifyHrNewEmployee(employee, io, createdByName) {
  const hrUsers = await User.find({
    role: { $in: ['management_admin', 'hr_recruiter'] },
    isActive: true,
  }).lean();
  if (!hrUsers.length) return;

  await notifyUsers(
    hrUsers.map((u) => u.id),
    {
      type: 'employee_added',
      title: 'New employee added',
      message: `${employee.personalDetails?.name || 'Employee'} (${employee.employeeId}) joined — visible on Employees & Attendance.`,
      link: '/dashboard/employees',
      meta: { employeeId: employee.id },
    },
    io,
  );
}

module.exports = {
  linkUserAsEmployee,
  markCandidateAsEmployee,
  notifyHrNewEmployee,
};
