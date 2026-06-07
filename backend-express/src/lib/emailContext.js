const config = require('../config');

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatDateRange(from, to) {
  if (!from && !to) return '—';
  if (from === to) return from;
  return `${from} → ${to}`;
}

function hrMeta() {
  return {
    org_name: config.orgName,
    app_url: config.appUrl,
    sent_by_hr: config.smtpUser,
    hr_label: `${config.orgName} Hiring`,
  };
}

function agentMeta() {
  return {
    ...hrMeta(),
    sent_by_agent: config.agentSmtpUser,
    agent_label: `${config.orgName} HR Agent`,
    hr_recipient: config.hrEmail,
  };
}

function buildEmployeeContext(emp, extra = {}) {
  const salary = emp.salary || {};
  const monthly = Number(salary.basic || 0) + Number(salary.allowance || 0);
  return {
    ...agentMeta(),
    employee_name: emp.personalDetails?.name || 'Employee',
    employee_id: emp.employeeId || `EMP${emp.id}`,
    employee_internal_id: emp.id,
    employee_email: emp.personalDetails?.email || '—',
    employee_phone: emp.personalDetails?.phone || '—',
    department: emp.department || '—',
    designation: emp.designation || '—',
    employment_type: emp.employmentType === 'internship' ? 'Internship' : 'Full-time',
    gender: emp.gender || '—',
    skills: (emp.skills || []).join(', ') || '—',
    monthly_salary_inr: monthly > 0 ? `₹${monthly.toLocaleString('en-IN')}/month` : '—',
    hired_at: emp.hiredAt ? new Date(emp.hiredAt).toISOString().slice(0, 10) : '—',
    ...extra,
  };
}

async function buildCandidateOfferContext(app, { onboardResult } = {}) {
  const { Job } = require('../models');
  const { POLICY_SUMMARY } = require('./leavePolicy');
  const job = await Job.findOne({ id: app.jobId }).lean();
  const fd = app.finalDecision || {};
  const empType = job?.employmentType || 'full_time';
  const jdText = stripHtml(job?.description || '').slice(0, 3500);
  const skills = job?.requiredSkills || job?.skills || app.matchedSkills || [];

  const ctx = {
    ...hrMeta(),
    application_id: app.id,
    candidate_name: app.candidateName || 'Candidate',
    candidate_email: app.candidateEmail || '—',
    candidate_phone: app.phone || '—',
    job_title: app.jobTitle,
    department: job?.department || 'General',
    employment_type: empType === 'internship' ? 'Internship' : 'Full-time',
    salary: fd.salary || '—',
    start_date: fd.startDate || '—',
    hr_message: stripHtml(fd.message || '').slice(0, 1500),
    leave_policy: POLICY_SUMMARY[empType] || POLICY_SUMMARY.full_time,
    job_description: jdText || 'See role details in the hiring portal.',
    required_skills: Array.isArray(skills) ? skills.join(', ') : String(skills || '—'),
    matched_skills: (app.matchedSkills || []).join(', ') || '—',
    screening_score: app.jdScore != null ? `${Math.round(app.jdScore)}/100` : '—',
    decided_by: fd.decidedByName || 'HR',
    decided_at: fd.decidedAt ? new Date(fd.decidedAt).toISOString().slice(0, 10) : '—',
    portal_url: `${config.appUrl}/dashboard/job-openings`,
    applications_url: `${config.appUrl}/dashboard/applications`,
  };

  if (onboardResult?.employee) {
    const emp = onboardResult.employee;
    ctx.new_employee_id = emp.employeeId || emp.id;
    ctx.new_employee_department = emp.department;
    ctx.new_employee_designation = emp.designation;
    ctx.employee_onboarded = onboardResult.created ?? false;
  }

  return ctx;
}

function buildLeaveRequestContext(emp, leave, { leaveSummary, check } = {}) {
  const balances = leaveSummary?.balances || {};
  const balanceLines = Object.entries(balances)
    .filter(([, v]) => v && typeof v === 'object')
    .map(([k, v]) => `${k}: ${v.remaining ?? v.balance ?? '—'} remaining`)
    .join('; ');

  return buildEmployeeContext(emp, {
    leave_request_id: leave.id,
    leave_type: leave.type,
    from_date: leave.fromDate,
    to_date: leave.toDate,
    date_range: formatDateRange(leave.fromDate, leave.toDate),
    days_requested: leave.days || check?.days,
    reason: stripHtml(leave.reason || '').slice(0, 800),
    leave_year: leave.year || new Date().getFullYear(),
    leave_balances: balanceLines || 'See Attendance dashboard',
    exceeds_balance: check?.exceedsBalance ? 'Yes — may affect payroll' : 'No',
    submitted_at: new Date().toISOString(),
    dashboard_url: `${config.appUrl}/dashboard/attendance`,
    action_required: 'Review and approve or reject in Attendance dashboard',
  });
}

function buildAiInterviewRejectionContext(app, interview, { note } = {}) {
  const screening = app.screening || {};
  return {
    ...hrMeta(),
    candidate_name: app.candidateName || 'Candidate',
    candidate_email: app.candidateEmail || '—',
    job_title: app.jobTitle,
    screening_score: app.jdScore != null ? `${Math.round(app.jdScore)}/100` : '—',
    screening_verdict: screening.verdict || app.recommendation || '—',
    interview_score: interview?.interviewScore != null ? `${Math.round(interview.interviewScore)}/100` : '—',
    composite_score: interview?.compositeScore != null
      ? `${Math.round(interview.compositeScore)}/100`
      : (interview?.finalScore != null ? `${Math.round(interview.finalScore)}/100` : '—'),
    ai_verdict: interview?.verdict || interview?.shortlistVerdict || '—',
    matched_skills: (app.matchedSkills || []).join(', ') || '—',
    hr_note: stripHtml(note || '').slice(0, 800),
    portal_url: `${config.appUrl}/dashboard/job-openings`,
  };
}

function buildReimbursementContext(emp, claim) {
  return buildEmployeeContext(emp, {
    claim_id: claim.id,
    category: claim.category,
    amount: claim.amount,
    formatted_amount: `₹${Number(claim.amount || 0).toLocaleString('en-IN')}`,
    currency: claim.currency || 'INR',
    description: stripHtml(claim.description || '').slice(0, 800),
    submitted_at: claim.createdAt ? new Date(claim.createdAt).toISOString() : new Date().toISOString(),
    dashboard_url: `${config.appUrl}/dashboard/payroll`,
    action_required: 'Review and approve reimbursement in Payroll dashboard',
  });
}

module.exports = {
  stripHtml,
  hrMeta,
  agentMeta,
  buildEmployeeContext,
  buildCandidateOfferContext,
  buildAiInterviewRejectionContext,
  buildLeaveRequestContext,
  buildReimbursementContext,
};
