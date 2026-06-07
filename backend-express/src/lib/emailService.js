const nodemailer = require('nodemailer');
const config = require('../config');
const { getAgentOAuthAuth } = require('./agentMailAuth');
const { getHrOAuthAuth } = require('./hrMailAuth');

let hrTransporter = null;
let agentTransporter = null;

function getHrTransporter() {
  if (hrTransporter) return hrTransporter;

  const oauth = getHrOAuthAuth();
  if (!oauth) return null;

  hrTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: oauth,
  });
  return hrTransporter;
}

function getAgentTransporter() {
  if (agentTransporter) return agentTransporter;

  const oauth = getAgentOAuthAuth();
  if (oauth) {
    agentTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: oauth,
    });
    return agentTransporter;
  }

  if (!config.agentSmtpUser || !config.agentSmtpPassword) return null;
  agentTransporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.agentSmtpUser, pass: config.agentSmtpPassword },
  });
  return agentTransporter;
}

async function sendMail({ to, subject, html, attachments = [], sender = 'hr' }) {
  if (!to) return { sent: false, reason: 'no_recipient' };
  const isAgent = sender === 'agent';
  const transport = isAgent ? getAgentTransporter() : getHrTransporter();
  const fromUser = isAgent ? config.agentSmtpUser : config.smtpUser;
  const fromLabel = isAgent ? `${config.orgName} HR Agent` : `${config.orgName} Hiring`;

  if (!transport || !fromUser) {
    const which = isAgent ? 'agent mail (OAuth)' : 'HR mail (OAuth — run npm run auth:calendar)';
    console.warn(`[email] ${which} not configured — skipping email to ${to}: ${subject}`);
    return { sent: false, reason: isAgent ? 'agent_mail_not_configured' : 'hr_oauth_not_configured' };
  }

  try {
    const mail = {
      from: `${fromLabel} <${fromUser}>`,
      to,
      subject,
      html,
      replyTo: config.hrEmail || config.smtpUser,
    };
    if (attachments?.length) {
      mail.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType || 'application/octet-stream',
      }));
    }
    await transport.sendMail(mail);
    console.log(`[email:${sender}] Sent from ${fromUser} to ${to}: ${subject}`);
    return { sent: true, sender, from: fromUser };
  } catch (err) {
    console.error(`[email:${sender}] Failed to ${to}:`, err.message);
    return { sent: false, reason: err.message, sender };
  }
}

/** HR mail — interviews, Meet links, offer/rejection to candidates, payslips to employees */
async function sendHrEmail(to, subject, html, attachments = []) {
  return sendMail({ to, subject, html, attachments, sender: 'hr' });
}

/** Agent mail — candidate offer acceptance & employee leave/reimbursement notifications to HR */
async function sendAgentEmail(to, subject, html, attachments = []) {
  return sendMail({ to, subject, html, attachments, sender: 'agent' });
}

async function sendHrTemplateEmail(to, templateFn, data, attachments = []) {
  const { subject, html } = templateFn(data);
  return sendHrEmail(to, subject, html, attachments);
}

async function sendAgentTemplateEmail(to, templateFn, data, attachments = []) {
  const { subject, html } = templateFn(data);
  return sendAgentEmail(to, subject, html, attachments);
}

/** @deprecated use sendHrEmail or sendAgentEmail */
async function sendEmail(to, subject, html, attachments = []) {
  return sendHrEmail(to, subject, html, attachments);
}

/** @deprecated use sendHrTemplateEmail */
async function sendTemplateEmail(to, templateFn, data, attachments = []) {
  return sendHrTemplateEmail(to, templateFn, data, attachments);
}

module.exports = {
  sendMail,
  sendHrEmail,
  sendAgentEmail,
  sendHrTemplateEmail,
  sendAgentTemplateEmail,
  sendEmail,
  sendTemplateEmail,
};
