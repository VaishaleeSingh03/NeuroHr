/** Org leave policy — intern vs full-time, female maternity/medical entitlements. */

const POLICY_SUMMARY = {
  internship: '6 sick + 14 casual + 12 unpaid (1/month) per year',
  full_time: '6 sick + 14 casual + 12 unpaid (1/month) + 30 additional + maternity (6mo, female) + 1yr full medical + 6mo half medical',
};

function currentYear() {
  return new Date().getFullYear();
}

function buildLeaveEntitlements({ employmentType = 'full_time', gender = 'other', year = currentYear() }) {
  const isIntern = employmentType === 'internship';
  const isFemale = gender === 'female';
  return {
    year,
    employmentType,
    gender,
    sick: 6,
    casual: 14,
    unpaid: 12,
    unpaid_monthly_cap: 1,
    additional: isIntern ? 0 : 30,
    maternity: (!isIntern && isFemale) ? 180 : 0,
    medical_full: isIntern ? 0 : 365,
    medical_half: isIntern ? 0 : 183,
    policyNote: isIntern ? POLICY_SUMMARY.internship : POLICY_SUMMARY.full_time,
  };
}

function emptyUsage() {
  return {
    sick: 0,
    casual: 0,
    unpaid: 0,
    additional: 0,
    maternity: 0,
    medical_full: 0,
    medical_half: 0,
  };
}

function parseDate(s) {
  return new Date(`${s}T12:00:00`);
}

function countDays(fromDate, toDate) {
  const start = parseDate(fromDate);
  const end = parseDate(toDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

function daysInMonth(fromDate, toDate, month) {
  const [y, m] = month.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0);
  const start = parseDate(fromDate);
  const end = parseDate(toDate);
  const overlapStart = start > monthStart ? start : monthStart;
  const overlapEnd = end < monthEnd ? end : monthEnd;
  if (overlapEnd < overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
}

function leaveYear(fromDate) {
  return parseDate(fromDate).getFullYear();
}

const TYPE_ALIASES = {
  sick: 'sick',
  casual: 'casual',
  unpaid: 'unpaid',
  additional: 'additional',
  annual: 'additional',
  maternity: 'maternity',
  medical_full: 'medical_full',
  medical_half: 'medical_half',
  medical: 'medical_full',
};

function normalizeLeaveType(type) {
  return TYPE_ALIASES[String(type || '').toLowerCase()] || null;
}

function entitlementKey(type) {
  return normalizeLeaveType(type);
}

function getRemaining(entitlements, used, type) {
  const key = entitlementKey(type);
  if (!key || entitlements[key] == null) return 0;
  return Math.max(0, (entitlements[key] || 0) - (used[key] || 0));
}

function summarizeBalances(entitlements, used) {
  const keys = ['sick', 'casual', 'unpaid', 'additional', 'maternity', 'medical_full', 'medical_half'];
  return keys.reduce((acc, k) => {
    if (!entitlements[k]) {
      acc[k] = { granted: 0, used: used[k] || 0, remaining: 0 };
    } else {
      acc[k] = {
        granted: entitlements[k],
        used: used[k] || 0,
        remaining: Math.max(0, entitlements[k] - (used[k] || 0)),
      };
    }
    return acc;
  }, {});
}

function computeUsedFromLeaves(approvedLeaves, year) {
  const used = emptyUsage();
  for (const lv of approvedLeaves) {
    if (lv.status !== 'approved') continue;
    if (leaveYear(lv.fromDate) !== year) continue;
    const key = entitlementKey(lv.type);
    if (!key) continue;
    used[key] += lv.days || countDays(lv.fromDate, lv.toDate);
  }
  return used;
}

function validateLeaveRequest({ entitlements, used, type, fromDate, toDate, month }) {
  const key = entitlementKey(type);
  if (!key) return { ok: false, error: 'Invalid leave type' };
  const days = countDays(fromDate, toDate);
  if (days < 1) return { ok: false, error: 'Invalid date range' };

  if (key === 'unpaid' && month) {
    const [y, m] = month.split('-').map(Number);
    const monthLeaves = used.unpaid_monthly || 0;
    if (days > 1 && monthLeaves >= (entitlements.unpaid_monthly_cap || 1)) {
      return { ok: false, error: 'Only 1 unpaid leave day allowed per month' };
    }
  }

  const remaining = getRemaining(entitlements, used, key);
  if (key !== 'unpaid' && remaining <= 0 && (entitlements[key] || 0) > 0) {
    return { ok: false, error: `No ${key.replace('_', ' ')} leave balance remaining` };
  }

  return { ok: true, days, exceedsBalance: days > remaining, remaining };
}

/**
 * Payroll leave deduction for a month.
 * Within granted balance → no deduction (except unpaid = always unpaid days).
 * medical_half within balance → 50% daily rate per day.
 * Excess beyond balance → full daily rate per excess day.
 */
function computeLeaveDeduction({ entitlements, approvedLeaves, month, basic }) {
  const [year] = month.split('-').map(Number);
  const dailyRate = basic > 0 ? basic / 30 : 0;
  const usedBeforeMonth = computeUsedFromLeaves(
    approvedLeaves.filter((l) => l.toDate < `${month}-01`),
    year,
  );

  const monthLeaves = approvedLeaves.filter((l) => {
    if (l.status !== 'approved') return false;
    return daysInMonth(l.fromDate, l.toDate, month) > 0;
  });

  const breakdown = [];
  let leaveDeduction = 0;
  const runningUsed = { ...usedBeforeMonth };

  for (const lv of monthLeaves) {
    const key = entitlementKey(lv.type);
    if (!key) continue;
    const days = daysInMonth(lv.fromDate, lv.toDate, month);
    const remaining = getRemaining(entitlements, runningUsed, key);
    const within = Math.min(days, remaining);
    const excess = Math.max(0, days - within);

    if (key === 'unpaid') {
      const amount = Math.round(dailyRate * days);
      leaveDeduction += amount;
      breakdown.push({ type: key, days, within: 0, excess: days, amount, note: 'Unpaid leave — full day deduction' });
    } else if (key === 'medical_half') {
      const halfAmount = Math.round(dailyRate * 0.5 * within);
      const excessAmount = Math.round(dailyRate * excess);
      leaveDeduction += halfAmount + excessAmount;
      breakdown.push({
        type: key, days, within, excess,
        amount: halfAmount + excessAmount,
        note: excess ? 'Half pay within balance; full deduction on excess' : 'Half pay medical leave',
      });
    } else {
      const excessAmount = Math.round(dailyRate * excess);
      leaveDeduction += excessAmount;
      if (excess > 0 || within > 0) {
        breakdown.push({
          type: key, days, within, excess, amount: excessAmount,
          note: excess ? `${within} day(s) within balance (no deduction); ${excess} excess day(s) deducted` : `${within} day(s) within granted balance — no deduction`,
        });
      }
    }

    runningUsed[key] = (runningUsed[key] || 0) + days;
  }

  return {
    leaveDeduction,
    leaveBreakdown: breakdown,
    monthLeaveDays: monthLeaves.reduce((sum, l) => sum + daysInMonth(l.fromDate, l.toDate, month), 0),
    dailyRate: Math.round(dailyRate),
    balances: summarizeBalances(entitlements, runningUsed),
  };
}

module.exports = {
  POLICY_SUMMARY,
  buildLeaveEntitlements,
  emptyUsage,
  countDays,
  daysInMonth,
  leaveYear,
  normalizeLeaveType,
  summarizeBalances,
  computeUsedFromLeaves,
  validateLeaveRequest,
  computeLeaveDeduction,
  currentYear,
};
