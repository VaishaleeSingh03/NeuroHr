const config = require('../config');
const { buildResponsiveEmail, emailButton, emailInfoCard } = require('./emailLayout');

function wrapHtml(title, body) {
  return buildResponsiveEmail({
    title,
    bodyHtml: body,
    orgName: config.orgName,
    brand: 'neurohr',
  });
}

function wrapAgentHtml(title, body) {
  return buildResponsiveEmail({
    title,
    bodyHtml: body,
    orgName: config.orgName,
    brand: 'agent',
    footerNote: `Automated notification from <strong>${config.orgName} HR Agent</strong> (${config.agentSmtpUser})`,
  });
}

const btn = emailButton;

function screeningRejected({ name, jobTitle, jdScore, threshold }) {
  return {
    subject: `Application Update — ${jobTitle}`,
    html: wrapHtml('Application Update', `
      <p>Hi ${name},</p>
      <p>Thank you for applying for <strong>${jobTitle}</strong> at ${config.orgName}.</p>
      <p>After AI resume screening against the job description, your JD match score was <strong>${jdScore}%</strong>. Our minimum to proceed is <strong>${threshold}%</strong>.</p>
      <p>Unfortunately, we won't be moving forward with your application at this time. We encourage you to apply for other roles that better match your skills.</p>
      ${btn(`${config.appUrl}/dashboard/job-openings`, 'View Job Openings')}
    `),
  };
}

function interviewScheduled({ name, jobTitle, deadline }) {
  return {
    subject: `AI Interview Scheduled — ${jobTitle}`,
    html: wrapHtml('Interview Invitation', `
      <p>Hi ${name},</p>
      <p>Great news — you've been shortlisted for <strong>${jobTitle}</strong>!</p>
      <p>Your AI voice interview is ready. Please complete it before:</p>
      <p style="font-size: 18px; font-weight: bold; color: #00B8B8;">${deadline}</p>
      <p>Allow camera and microphone access when you start. Questions are tailored to the job description.</p>
      ${btn(`${config.appUrl}/dashboard/interviews`, 'Start My Interview')}
    `),
  };
}

function interviewCompleted({ name, jobTitle }) {
  return {
    subject: `Interview Complete — ${jobTitle}`,
    html: wrapHtml('Interview Complete', `
      <p>Hi ${name},</p>
      <p>Thank you for completing your AI interview for the <strong>${jobTitle}</strong> position at ${config.orgName}.</p>
      <p>Your interview has been evaluated. Our hiring team will review the results and get back to you within <strong>2–3 business days</strong>.</p>
      <p>Best regards,<br><strong>${config.orgName} Hiring Team</strong></p>
    `),
  };
}

function interviewRejected({ name, jobTitle }) {
  return {
    subject: `Application Update — ${jobTitle}`,
    html: wrapHtml('Application Update', `
      <p>Hi ${name},</p>
      <p>Thank you for completing the AI interview for <strong>${jobTitle}</strong>.</p>
      <p>After careful evaluation, we have decided to move forward with other candidates. We wish you the best.</p>
      <p>Best regards,<br><strong>${config.orgName} Hiring Team</strong></p>
      ${btn(`${config.appUrl}/dashboard/job-openings`, 'Browse Other Roles')}
    `),
  };
}

function interviewPassedHrNotice({
  candidateName, jobTitle, interviewScore, compositeScore, screeningScore,
  verdict, shortlistVerdict, strengths, concerns, recommendation,
}) {
  const verdictColor = interviewScore >= 70 ? '#16a34a' : interviewScore >= 55 ? '#ca8a04' : '#dc2626';
  return {
    subject: `Interview Result: ${candidateName} — ${verdict}`,
    html: wrapHtml(`Interview Result: ${candidateName}`, `
      <p><strong>Role:</strong> ${jobTitle}</p>
      <p><strong>Interview score:</strong>
        <span style="color:${verdictColor};font-size:24px;font-weight:bold">${interviewScore}/100</span></p>
      <p><strong>Screening score:</strong> ${screeningScore}/100</p>
      <p><strong>Composite (80% screening + 20% interview):</strong> <strong>${compositeScore}/100</strong></p>
      <p><strong>Verdict:</strong> ${verdict}</p>
      <p><strong>Pipeline:</strong> ${shortlistVerdict || 'Pending HR review'}</p>
      ${strengths ? `<p><strong>Strengths:</strong> ${strengths}</p>` : ''}
      ${concerns ? `<p><strong>Concerns:</strong> ${concerns}</p>` : ''}
      <p><strong>Recommendation:</strong> ${recommendation}</p>
      ${btn(`${config.appUrl}/dashboard/applications`, 'Review on Dashboard')}
    `),
  };
}

function formatPanelList(interviewers = []) {
  if (!interviewers.length) return '';
  return interviewers
    .map((i) => `${i.name}${i.role ? ` (${i.role})` : ''}`)
    .join(', ');
}

function humanInterviewScheduled({
  name, jobTitle, interviewDate, interviewTime, durationMinutes, meetLink, notes, interviewers,
}) {
  const meet = meetLink && meetLink.startsWith('http')
    ? meetLink
    : 'Google Meet link will be shared separately';
  const panel = formatPanelList(interviewers);
  return {
    subject: `Final Interview — ${jobTitle} | ${interviewDate} ${interviewTime}`,
    html: wrapHtml(`Final Interview — ${jobTitle}`, `
      <p>Hi ${name},</p>
      <p>Congratulations on clearing the screening round! You've been shortlisted for a <strong>final technical interview</strong> with our team at ${config.orgName}.</p>
      ${emailInfoCard(`
        <p style="margin:4px 0"><strong>Role:</strong> ${jobTitle}</p>
        <p style="margin:4px 0"><strong>Date:</strong> ${interviewDate}</p>
        <p style="margin:4px 0"><strong>Time:</strong> ${interviewTime}</p>
        <p style="margin:4px 0"><strong>Duration:</strong> ${durationMinutes || 60} minutes</p>
        <p style="margin:4px 0"><strong>Meeting link:</strong> <a href="${meet}" style="word-break:break-all;">${meet}</a></p>
        ${panel ? `<p style="margin:4px 0"><strong>Interviewers:</strong> ${panel}</p>` : ''}
      `)}
      <h3 style="color:#555;font-size:14px;margin-top:20px">How to prepare</h3>
      <ul style="color:#666;font-size:14px;line-height:1.7">
        <li>Review the projects mentioned in your resume — expect deep-dive questions</li>
        <li>Be ready to discuss system design and architecture decisions</li>
        <li>Have your development environment ready for a possible live coding exercise</li>
        <li>Prepare questions about the team and role</li>
      </ul>
      ${notes ? `<p style="color:#666;font-size:13px"><em>${notes}</em></p>` : ''}
      <p>Best of luck!<br><strong>${config.orgName} Hiring Team</strong></p>
    `),
  };
}

function humanInterviewInterviewer({
  interviewerName, interviewerRole, candidateName, jobTitle, interviewDate, interviewTime,
  durationMinutes, meetLink, interviewScore, aiVerdict, compositeScore, screeningScore,
  briefingHtml,
}) {
  const meet = meetLink && meetLink.startsWith('http')
    ? meetLink
    : 'Google Meet link will be shared separately';
  return {
    subject: `Interview Briefing: ${candidateName} — ${jobTitle} | ${interviewDate}`,
    html: wrapHtml(`Interview Briefing: ${candidateName}`, `
      <p>Hi ${interviewerName},</p>
      <p>You have a <strong>final technical interview</strong> scheduled as <strong>${interviewerRole || 'Panel Member'}</strong>:</p>
      ${emailInfoCard(`
        <p style="margin:4px 0"><strong>Candidate:</strong> ${candidateName}</p>
        <p style="margin:4px 0"><strong>Role:</strong> ${jobTitle}</p>
        <p style="margin:4px 0"><strong>Date:</strong> ${interviewDate} at ${interviewTime}</p>
        <p style="margin:4px 0"><strong>Duration:</strong> ${durationMinutes || 60} min</p>
        <p style="margin:4px 0"><strong>Meeting:</strong> <a href="${meet}" style="word-break:break-all;">${meet}</a></p>
        <p style="margin:4px 0"><strong>AI interview score:</strong> ${interviewScore ?? 'N/A'}/100 — ${aiVerdict || 'Review'}</p>
        ${screeningScore != null ? `<p style="margin:4px 0"><strong>Resume screening:</strong> ${screeningScore}/100</p>` : ''}
        ${compositeScore != null ? `<p style="margin:4px 0"><strong>Composite (80% screening + 20% interview):</strong> ${compositeScore}/100</p>` : ''}
      `)}
      <h3 style="color:#00B8B8;margin-top:24px">Candidate briefing &amp; suggested questions</h3>
      <div style="background:#fafafa;padding:16px;border-radius:8px;white-space:pre-wrap;line-height:1.7;font-size:14px">
        ${briefingHtml || '<p>Review the candidate resume (attached) and AI interview results in Applications.</p>'}
      </div>
      <p style="margin-top:20px;color:#888;font-size:13px">The candidate resume is attached with full AI screening and interview insights. After the session, update the verdict in Applications inbox.</p>
      ${btn(`${config.appUrl}/dashboard/applications`, 'Open Dashboard')}
    `),
  };
}

function finalSelected({ name, jobTitle, salary, startDate, message, employmentType, leavePolicy }) {
  const compBlock = salary || startDate
    ? `<div style="background:#f0fff4;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #4ade80">
        ${salary ? `<p style="margin:4px 0"><strong>Compensation:</strong> ${salary}</p>` : ''}
        ${startDate ? `<p style="margin:4px 0"><strong>Proposed start date:</strong> ${startDate}</p>` : ''}
      </div>`
    : '';
  return {
    subject: `Congratulations! Offer — ${jobTitle} at ${config.orgName}`,
    html: wrapHtml(`Congratulations, ${name}!`, `
      <p>Hi ${name},</p>
      <p>We are thrilled to offer you the position of <strong>${jobTitle}</strong> at ${config.orgName}.</p>
      <p><strong>Employment type:</strong> ${employmentType === 'internship' ? 'Internship' : 'Full-time (full pay)'}</p>
      ${leavePolicy ? `<p style="font-size:13px;color:#555;background:#f8fafc;padding:12px;border-radius:8px"><strong>Leave policy:</strong> ${leavePolicy}</p>` : ''}
      <p>After a thorough evaluation — resume screening, AI interview, and final panel interview — our team was impressed by your skills, depth of experience, and alignment with our mission.</p>
      ${compBlock}
      ${message ? `<div style="margin:16px 0;color:#333;line-height:1.6">${message}</div>` : ''}
      <p>Please reply to this email within <strong>5 business days</strong> to confirm your acceptance or discuss any questions.</p>
      <p>We look forward to having you on the team!<br><strong>${config.orgName} Hiring Team</strong></p>
    `),
  };
}

function finalRejected({ name, jobTitle, message }) {
  return {
    subject: `Application Update — ${jobTitle} at ${config.orgName}`,
    html: wrapHtml(`Thank You, ${name}`, `
      <p>Hi ${name},</p>
      <p>Thank you for your time and effort throughout our interview process for the <strong>${jobTitle}</strong> position at ${config.orgName}.</p>
      <p>After careful consideration, we have decided to move forward with another candidate whose profile more closely matches our current requirements.</p>
      ${message ? `<div style="margin:16px 0;color:#333;line-height:1.6">${message}</div>` : ''}
      <p>Your technical skills are valued and we encourage you to apply for future openings at ${config.orgName}.</p>
      <p>Wishing you the best,<br><strong>${config.orgName} Hiring Team</strong></p>
      ${btn(`${config.appUrl}/dashboard/job-openings`, 'Browse Open Roles')}
    `),
  };
}

function finalDecisionHrNotice({
  candidateName, jobTitle, decision, salary, emailSent,
}) {
  const selected = decision === 'selected';
  return {
    subject: `Final Decision: ${candidateName} — ${selected ? 'SELECTED' : 'REJECTED'}`,
    html: wrapHtml(`Final Decision: ${candidateName}`, `
      <p><strong>Role:</strong> ${jobTitle}</p>
      <p><strong>Decision:</strong> ${selected ? '✅ SELECTED — Offer email sent to candidate' : '❌ REJECTED — Rejection email sent to candidate'}</p>
      ${salary ? `<p><strong>Offer compensation:</strong> ${salary}</p>` : ''}
      <p><strong>Candidate email sent:</strong> ${emailSent ? 'Yes' : 'Failed — check SMTP logs'}</p>
      ${btn(`${config.appUrl}/dashboard/applications`, 'Open Applications')}
    `),
  };
}

function payrollPayslip({
  name, employeeId, designation, department, month,
  basic, allowance, bonus, deductions, leaveDeduction, tax, netPay, currency, leaveSummaryHtml, anomalyNote,
}) {
  const fmt = (n) => (currency === 'INR' ? `₹${Number(n).toLocaleString('en-IN')}` : `$${Number(n).toLocaleString()}`);
  const monthLabel = month ? new Date(`${month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : month;
  return {
    subject: `Payslip — ${monthLabel || month} | ${config.orgName}`,
    html: wrapHtml(`Payslip — ${monthLabel || month}`, `
      <p>Hi ${name},</p>
      <p>Your payroll for <strong>${monthLabel || month}</strong> has been generated by ${config.orgName} HR.</p>
      <div style="background:#EEEDFE;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #7C6EF0">
        <p style="margin:4px 0"><strong>Employee ID:</strong> ${employeeId || '—'}</p>
        <p style="margin:4px 0"><strong>Role:</strong> ${designation || '—'} · ${department || '—'}</p>
      </div>
      <table class="email-stack" role="presentation" style="width:100%;max-width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
        <tr style="background:#f8fafc"><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>Earnings</strong></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right"></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9">Basic salary</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right">${fmt(basic)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9">Allowance</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right">${fmt(allowance)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9">Bonus</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right">${fmt(bonus)}</td></tr>
        <tr style="background:#f8fafc"><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>Deductions</strong></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right"></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9">Tax (TDS estimate)</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right">${fmt(tax)}</td></tr>
        ${leaveDeduction ? `<tr><td style="padding:8px;border-bottom:1px solid #f1f5f9">Leave deduction</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right">${fmt(leaveDeduction)}</td></tr>` : ''}
        <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9">Other deductions</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right">${fmt(Math.max(0, (deductions || 0) - (leaveDeduction || 0)))}</td></tr>
        <tr style="background:#ecfdf5"><td style="padding:12px;font-size:16px"><strong>Net pay</strong></td><td style="padding:12px;text-align:right;font-size:18px;font-weight:bold;color:#059669">${fmt(netPay)}</td></tr>
      </table>
      ${leaveSummaryHtml || ''}
      ${anomalyNote ? `<p style="font-size:12px;color:#b45309;background:#fffbeb;padding:10px;border-radius:6px">${anomalyNote}</p>` : ''}
      <p style="font-size:13px;color:#666">If you have questions about this payslip, reply to this email or contact HR.</p>
      ${btn(`${config.appUrl}/dashboard/payroll`, 'View in Dashboard')}
      <p>Best regards,<br><strong>${config.orgName} Payroll Team</strong></p>
    `),
  };
}

function leaveRequestHrNotice({
  name, employeeId, department, designation, employmentType, email,
  leaveType, fromDate, toDate, days, reason, requestId, balanceSummary, exceedsBalance,
}) {
  const typeLabel = String(leaveType || '').replace(/_/g, ' ');
  const empType = employmentType === 'internship' ? 'Internship' : 'Full-time';
  const balanceBlock = balanceSummary
    ? `<p style="font-size:13px;color:#555;background:#f8fafc;padding:12px;border-radius:8px;margin:16px 0"><strong>Leave balances:</strong> ${balanceSummary}</p>`
    : '';
  const exceedBlock = exceedsBalance
    ? `<p style="font-size:13px;color:#b45309;background:#fffbeb;padding:10px;border-radius:6px;margin:12px 0"><strong>Note:</strong> This request exceeds remaining balance — excess days may be deducted from payroll.</p>`
    : '';
  const reasonBlock = reason
    ? `<div style="margin:16px 0;padding:12px;background:#fff;border-radius:8px;border-left:4px solid #00B8B8;color:#334155;line-height:1.6">${reason}</div>`
    : '<p style="color:#64748b">No reason provided.</p>';

  return {
    subject: `Leave request — ${name} (${typeLabel}, ${days} day${days === 1 ? '' : 's'})`,
    html: wrapAgentHtml('New Leave Request', `
      <p>A new leave request requires your review.</p>
      ${emailInfoCard(`
        <p style="margin:0 0 8px"><strong>Employee:</strong> ${name} (${employeeId})</p>
        <p style="margin:0 0 8px"><strong>Email:</strong> ${email || '—'}</p>
        <p style="margin:0 0 8px"><strong>Department:</strong> ${department || '—'} · <strong>Role:</strong> ${designation || '—'}</p>
        <p style="margin:0"><strong>Employment:</strong> ${empType}</p>
      `)}
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:16px 0;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;width:40%">Request #</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${requestId}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Leave type</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-transform:capitalize">${typeLabel}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Dates</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${fromDate} → ${toDate}</td></tr>
        <tr><td style="padding:8px;color:#64748b">Days</td><td style="padding:8px;font-weight:600">${days}</td></tr>
      </table>
      <p><strong>Reason</strong></p>
      ${reasonBlock}
      ${balanceBlock}
      ${exceedBlock}
      <p style="font-size:13px;color:#64748b">Please approve or reject in the Attendance dashboard.</p>
      ${btn(`${config.appUrl}/dashboard/attendance`, 'Review in Dashboard')}
    `),
  };
}

function recruiterMessage({ name, jobTitle, message }) {
  return {
    subject: `Message from ${config.orgName} — ${jobTitle}`,
    html: wrapHtml('Message from Recruiter', `
      <p>Hi ${name},</p>
      <p>Regarding your application for <strong>${jobTitle}</strong>:</p>
      <blockquote style="border-left: 4px solid #00B8B8; padding-left: 16px; margin: 16px 0; color: #333;">${message}</blockquote>
      ${btn(`${config.appUrl}/dashboard/job-openings`, 'View Application')}
    `),
  };
}

function offerAcceptedHr({
  candidateName, jobTitle, candidateNote, respondedAt, actionRequired,
}) {
  return {
    subject: `Offer accepted — ${candidateName} (${jobTitle})`,
    html: wrapAgentHtml('Offer Accepted', `
      <p><strong>${candidateName}</strong> has <strong>accepted</strong> the offer for <strong>${jobTitle}</strong>.</p>
      ${candidateNote && candidateNote !== '—' ? `<p><strong>Candidate note:</strong> ${candidateNote}</p>` : ''}
      ${respondedAt ? `<p><strong>Responded:</strong> ${respondedAt}</p>` : ''}
      <p><strong>Action required:</strong> ${actionRequired || 'Complete onboarding and assign manager.'}</p>
      ${btn(`${config.appUrl}/dashboard/applications`, 'Open Applications')}
    `),
  };
}

function offerDeclinedHr({
  candidateName, jobTitle, candidateNote, respondedAt, actionRequired,
}) {
  return {
    subject: `Offer declined — ${candidateName} (${jobTitle})`,
    html: wrapAgentHtml('Offer Declined', `
      <p><strong>${candidateName}</strong> has <strong>declined</strong> the offer for <strong>${jobTitle}</strong>.</p>
      ${candidateNote && candidateNote !== '—' ? `<p><strong>Candidate note:</strong> ${candidateNote}</p>` : ''}
      ${respondedAt ? `<p><strong>Responded:</strong> ${respondedAt}</p>` : ''}
      <p><strong>Action required:</strong> ${actionRequired || 'Consider reopening the role or contacting backup candidates.'}</p>
      ${btn(`${config.appUrl}/dashboard/applications`, 'Open Applications')}
    `),
  };
}

function reimbursementRequest({
  name, employeeId, department, designation, category, amount, description, claimId,
}) {
  return {
    subject: `Reimbursement request — ${name} (${amount})`,
    html: wrapAgentHtml('Reimbursement Request', `
      <p><strong>${name}</strong> (${employeeId || '—'}) submitted a reimbursement claim.</p>
      ${emailInfoCard(`
        <p style="margin:4px 0"><strong>Department:</strong> ${department || '—'} · <strong>Role:</strong> ${designation || '—'}</p>
        <p style="margin:4px 0"><strong>Category:</strong> ${category || 'general'}</p>
        <p style="margin:4px 0"><strong>Amount:</strong> ${amount}</p>
        <p style="margin:4px 0"><strong>Claim #:</strong> ${claimId || '—'}</p>
      `)}
      <p><strong>Description</strong></p>
      <p style="color:#334155;line-height:1.6">${description || '—'}</p>
      ${btn(`${config.appUrl}/dashboard/payroll`, 'Review in Dashboard')}
    `),
  };
}

module.exports = {
  screeningRejected,
  interviewScheduled,
  interviewCompleted,
  interviewRejected,
  interviewPassedHrNotice,
  humanInterviewScheduled,
  humanInterviewInterviewer,
  finalSelected,
  finalRejected,
  finalDecisionHrNotice,
  payrollPayslip,
  leaveRequestHrNotice,
  recruiterMessage,
  offerAcceptedHr,
  offerDeclinedHr,
  reimbursementRequest,
};
