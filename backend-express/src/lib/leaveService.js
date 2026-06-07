const { Leave } = require('../models');
const {
  buildLeaveEntitlements, computeUsedFromLeaves, validateLeaveRequest,
  computeLeaveDeduction, summarizeBalances, countDays, leaveYear, currentYear,
} = require('./leavePolicy');

function ensureEmployeeLeaveState(emp) {
  const year = currentYear();
  let entitlements = emp.leaveEntitlements;
  if (!entitlements || entitlements.year !== year) {
    entitlements = buildLeaveEntitlements({
      employmentType: emp.employmentType || 'full_time',
      gender: emp.gender || 'other',
      year,
    });
  }
  const used = computeUsedFromLeaves([], year);
  return { entitlements, used, year };
}

async function getApprovedLeavesForEmployee(employeeId, year) {
  const leaves = await Leave.find({ employeeId, status: 'approved' }).lean();
  return leaves.filter((l) => leaveYear(l.fromDate) === year || leaveYear(l.toDate) === year);
}

async function getEmployeeLeaveSummary(emp) {
  const year = currentYear();
  const entitlements = emp.leaveEntitlements?.year === year
    ? emp.leaveEntitlements
    : buildLeaveEntitlements({
      employmentType: emp.employmentType || 'full_time',
      gender: emp.gender || 'other',
      year,
    });
  const approved = await getApprovedLeavesForEmployee(emp.id, year);
  const used = computeUsedFromLeaves(approved, year);
  const balances = summarizeBalances(entitlements, used);

  const month = new Date().toISOString().slice(0, 7);
  const monthLeaves = approved.filter((l) => {
    const { daysInMonth } = require('./leavePolicy');
    return daysInMonth(l.fromDate, l.toDate, month) > 0;
  }).map((l) => ({
    ...l,
    daysInMonth: require('./leavePolicy').daysInMonth(l.fromDate, l.toDate, month),
  }));

  return {
    employeeId: emp.id,
    name: emp.personalDetails?.name,
    email: emp.personalDetails?.email,
    employmentType: emp.employmentType,
    gender: emp.gender,
    year,
    entitlements,
    balances,
    month,
    monthLeaves,
    policyNote: entitlements.policyNote,
  };
}

async function validateAndCreateLeave(emp, body) {
  const year = leaveYear(body.from_date);
  const entitlements = emp.leaveEntitlements?.year === year
    ? emp.leaveEntitlements
    : buildLeaveEntitlements({
      employmentType: emp.employmentType || 'full_time',
      gender: emp.gender || 'other',
      year,
    });
  const approved = await getApprovedLeavesForEmployee(emp.id, year);
  const used = computeUsedFromLeaves(approved, year);

  const check = validateLeaveRequest({
    entitlements,
    used,
    type: body.type,
    fromDate: body.from_date,
    toDate: body.to_date,
    month: body.from_date?.slice(0, 7),
  });
  if (!check.ok) return { error: check.error };

  return {
    days: check.days,
    year,
    entitlements,
    exceedsBalance: check.exceedsBalance,
  };
}

async function computePayrollLeaveAdjustment(emp, month) {
  const year = parseInt(month.split('-')[0], 10);
  const entitlements = emp.leaveEntitlements?.year === year
    ? emp.leaveEntitlements
    : buildLeaveEntitlements({
      employmentType: emp.employmentType || 'full_time',
      gender: emp.gender || 'other',
      year,
    });
  const approved = await getApprovedLeavesForEmployee(emp.id, year);
  const basic = emp.salary?.basic || 0;
  return computeLeaveDeduction({ entitlements, approvedLeaves: approved, month, basic });
}

module.exports = {
  ensureEmployeeLeaveState,
  getApprovedLeavesForEmployee,
  getEmployeeLeaveSummary,
  validateAndCreateLeave,
  computePayrollLeaveAdjustment,
  countDays,
};
