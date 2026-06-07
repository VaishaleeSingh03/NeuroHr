const config = require('../config');
const ml = require('../services/mlClient');
const { sendHrEmail, sendAgentEmail } = require('./emailService');
const { buildResponsiveEmail, enhanceGroqFragment } = require('./emailLayout');

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

async function generateGroqEmail(emailType, context, { brand = 'hr' } = {}) {
  const payload = await ml.generateHrEmail({
    email_type: emailType,
    context: {
      ...context,
      org_name: config.orgName,
      app_url: config.appUrl,
      sent_by_hr: config.smtpUser,
      sent_by_agent: config.agentSmtpUser,
      hr_recipient: config.hrEmail,
      agent_label: `${config.orgName} HR Agent`,
    },
  });
  const wrapBrand = brand === 'agent' ? 'agent' : 'hr';
  return {
    subject: payload.subject,
    html: wrapGroqEmail(payload.subject, payload.html, wrapBrand),
    body_html: payload.html,
    preview_text: payload.preview_text,
    generated_by: 'groq',
  };
}

/** HR → candidate/employee (offer letter, rejection, payslip) */
async function sendHrGroqEmail(to, emailType, context, attachments = []) {
  const mail = await generateGroqEmail(emailType, context, { brand: 'hr' });
  const result = await sendHrEmail(to, mail.subject, mail.html, attachments);
  return { ...result, subject: mail.subject, html: mail.html, body_html: mail.body_html, generated_by: 'groq' };
}

/** Agent → HR (offer accepted/declined, leave, reimbursement) */
async function sendAgentGroqEmail(to, emailType, context, attachments = []) {
  const mail = await generateGroqEmail(emailType, context, { brand: 'agent' });
  const result = await sendAgentEmail(to, mail.subject, mail.html, attachments);
  return { ...result, subject: mail.subject, html: mail.html, body_html: mail.body_html, generated_by: 'groq' };
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
};
