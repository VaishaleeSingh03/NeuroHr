const config = require('../config');
const ml = require('../services/mlClient');
const { generateHrEmailDirect } = require('./groqDirect');
const { sendHrEmail, sendAgentEmail } = require('./emailService');
const { buildResponsiveEmail, enhanceGroqFragment } = require('./emailLayout');
const templates = require('./emailTemplates');

function wrapGroqEmail(title, bodyHtml, brand) {
  return buildResponsiveEmail({
    title,
    bodyHtml: enhanceGroqFragment(bodyHtml),
    orgName: config.orgName,
    brand,
    footerNote: brand === 'agent'
      ? `Automated notification from <strong>${config.orgName} HR Agent</strong> (${config.agentSmtpUser})`
      : `Sent by <strong>${config.orgName} Hiring</strong> (${config.smtpUser})`,
  });
}

function parseScore(value) {
  if (value == null || value === '') return null;
  const n = parseInt(String(value).replace(/\/100$/, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function buildFallbackEmail(emailType, context = {}) {
  const c = context;
  switch (emailType) {
    case 'screening_rejected_candidate':
      return templates.screeningRejected({
        name: c.candidate_name || 'Candidate',
        jobTitle: c.job_title || 'the role',
        jdScore: parseScore(c.screening_score) ?? 0,
        threshold: c.threshold ?? 80,
      });
    case 'interview_rejected_candidate':
      return templates.interviewRejected({
        name: c.candidate_name || 'Candidate',
        jobTitle: c.job_title || 'the role',
      });
    case 'interview_scheduled':
      return templates.interviewScheduled({
        name: c.candidate_name || 'Candidate',
        jobTitle: c.job_title || 'the role',
        deadline: c.deadline || 'the scheduled deadline',
      });
    case 'interview_completed':
      return templates.interviewCompleted({
        name: c.candidate_name || 'Candidate',
        jobTitle: c.job_title || 'the role',
      });
    case 'interview_result_hr':
      return templates.interviewPassedHrNotice({
        candidateName: c.candidate_name,
        jobTitle: c.job_title,
        interviewScore: parseScore(c.interview_score),
        compositeScore: parseScore(c.composite_score),
        screeningScore: parseScore(c.screening_score),
        verdict: c.verdict,
        shortlistVerdict: c.shortlist_verdict,
        strengths: c.strengths,
        concerns: c.concerns,
        recommendation: c.recommendation,
      });
    case 'recruiter_message':
      return templates.recruiterMessage({
        name: c.candidate_name || 'Candidate',
        jobTitle: c.job_title || 'the role',
        message: c.message || '',
      });
    case 'human_interview_candidate':
      return templates.humanInterviewScheduled({
        name: c.candidate_name || 'Candidate',
        jobTitle: c.job_title,
        interviewDate: c.interview_date,
        interviewTime: c.interview_time,
        durationMinutes: c.duration_minutes,
        meetLink: c.meet_link,
        notes: c.notes,
        interviewers: (c.interviewers || '').split(',').filter(Boolean).map((name) => ({ name: name.trim() })),
      });
    case 'human_interview_interviewer':
      return templates.humanInterviewInterviewer({
        interviewerName: c.interviewer_name,
        interviewerRole: c.interviewer_role,
        candidateName: c.candidate_name,
        jobTitle: c.job_title,
        interviewDate: c.interview_date,
        interviewTime: c.interview_time,
        durationMinutes: c.duration_minutes,
        meetLink: c.meet_link,
        interviewScore: parseScore(c.interview_score),
        aiVerdict: c.ai_verdict,
        compositeScore: parseScore(c.composite_score),
        screeningScore: parseScore(c.screening_score),
        briefingHtml: c.briefing_html,
      });
    case 'offer_letter':
      return templates.finalSelected({
        name: c.candidate_name || 'Candidate',
        jobTitle: c.job_title,
        salary: c.salary,
        startDate: c.start_date,
        message: c.hr_message,
        employmentType: c.employment_type === 'Internship' ? 'internship' : 'full_time',
        leavePolicy: c.leave_policy,
      });
    case 'offer_rejected_candidate':
      return templates.finalRejected({
        name: c.candidate_name || 'Candidate',
        jobTitle: c.job_title,
        message: c.hr_message,
      });
    case 'offer_accepted_hr':
      return templates.offerAcceptedHr({
        candidateName: c.candidate_name,
        jobTitle: c.job_title,
        candidateNote: c.candidate_note,
        respondedAt: c.responded_at,
        actionRequired: c.action_required,
      });
    case 'offer_rejected_hr':
      return templates.offerDeclinedHr({
        candidateName: c.candidate_name,
        jobTitle: c.job_title,
        candidateNote: c.candidate_note,
        respondedAt: c.responded_at,
        actionRequired: c.action_required,
      });
    case 'reimbursement_request':
      return templates.reimbursementRequest({
        name: c.employee_name,
        employeeId: c.employee_id,
        department: c.department,
        designation: c.designation,
        category: c.category,
        amount: c.formatted_amount || c.amount,
        description: c.description,
        claimId: c.claim_id,
      });
    case 'leave_request':
      return templates.leaveRequestHrNotice({
        name: c.employee_name,
        employeeId: c.employee_id,
        department: c.department,
        designation: c.designation,
        employmentType: c.employment_type === 'Internship' ? 'internship' : 'full_time',
        email: c.employee_email,
        leaveType: c.leave_type,
        fromDate: c.from_date,
        toDate: c.to_date,
        days: c.days_requested,
        reason: c.reason,
        requestId: c.leave_request_id,
        balanceSummary: c.leave_balances,
        exceedsBalance: c.exceeds_balance === 'Yes — may affect payroll',
      });
    default:
      return {
        subject: `${config.orgName} notification`,
        html: wrapGroqEmail(
          'Notification',
          `<p>${config.orgName} — please check the dashboard for details.</p>`,
          'hr',
        ),
      };
  }
}

function enrichEmailContext(context = {}) {
  return {
    ...context,
    org_name: config.orgName,
    app_url: config.appUrl,
    sent_by_hr: config.smtpUser,
    sent_by_agent: config.agentSmtpUser,
    hr_recipient: config.hrEmail,
    agent_label: `${config.orgName} HR Agent`,
  };
}

async function generateGroqEmail(emailType, context, { brand = 'hr' } = {}) {
  const enriched = enrichEmailContext(context);
  const mode = config.hrEmailMode || 'groq';
  const wrapBrand = brand === 'agent' ? 'agent' : 'hr';

  if (mode === 'template') {
    const mail = buildFallbackEmail(emailType, enriched);
    return {
      subject: mail.subject,
      html: mail.html,
      body_html: mail.html,
      generated_by: 'template',
    };
  }

  const errors = [];

  if (config.groqApiKey) {
    try {
      const payload = await generateHrEmailDirect(emailType, enriched);
      return {
        subject: payload.subject,
        html: wrapGroqEmail(payload.subject, payload.html, wrapBrand),
        body_html: payload.html,
        preview_text: payload.preview_text,
        generated_by: payload.generated_by,
      };
    } catch (err) {
      errors.push(`direct:${err.message}`);
      console.warn(`[email] Direct Groq ${emailType} failed:`, err.message);
    }
  }

  const timeoutMs = config.hrEmailGroqTimeoutMs || 12000;
  try {
    const payload = await ml.generateHrEmail(
      { email_type: emailType, context: enriched },
      { timeout: timeoutMs },
    );
    return {
      subject: payload.subject,
      html: wrapGroqEmail(payload.subject, payload.html, wrapBrand),
      body_html: payload.html,
      preview_text: payload.preview_text,
      generated_by: 'groq_ml',
    };
  } catch (err) {
    errors.push(`ml:${err.message}`);
    console.warn(`[email] ML Groq ${emailType} failed:`, err.message);
  }

  throw new Error(errors.join(' | ') || 'groq_unavailable');
}

async function sendHrGroqEmail(to, emailType, context, attachments = []) {
  if (!to) return { sent: false, reason: 'no_recipient' };
  try {
    const mail = await generateGroqEmail(emailType, context, { brand: 'hr' });
    const result = await sendHrEmail(to, mail.subject, mail.html, attachments);
    return {
      ...result,
      subject: mail.subject,
      html: mail.html,
      body_html: mail.body_html,
      generated_by: mail.generated_by,
      groq_error: mail.groq_error,
    };
  } catch (err) {
    console.error(`[email] HR send failed (${emailType}):`, err.message);
    return { sent: false, reason: err.message, generated_by: 'error' };
  }
}

async function sendAgentGroqEmail(to, emailType, context, attachments = []) {
  if (!to) return { sent: false, reason: 'no_recipient' };
  try {
    const mail = await generateGroqEmail(emailType, context, { brand: 'agent' });
    const result = await sendAgentEmail(to, mail.subject, mail.html, attachments);
    return {
      ...result,
      subject: mail.subject,
      html: mail.html,
      body_html: mail.body_html,
      generated_by: mail.generated_by,
      groq_error: mail.groq_error,
    };
  } catch (err) {
    console.error(`[email] Agent send failed (${emailType}):`, err.message);
    return { sent: false, reason: err.message, generated_by: 'error' };
  }
}

/** @deprecated use sendHrGroqEmail or sendAgentGroqEmail */
async function sendGroqEmail(to, emailType, context, attachments = []) {
  return sendHrGroqEmail(to, emailType, context, attachments);
}

module.exports = {
  generateGroqEmail,
  sendHrGroqEmail,
  sendAgentGroqEmail,
  sendGroqEmail,
  wrapGroqEmail,
  buildFallbackEmail,
};
