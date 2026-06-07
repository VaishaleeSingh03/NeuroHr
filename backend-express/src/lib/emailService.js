const nodemailer = require('nodemailer');
const config = require('../config');
const { getAgentOAuthAuth } = require('./agentMailAuth');
const { getHrOAuthAuth } = require('./hrMailAuth');

let hrTransporter = null;
let agentTransporter = null;
let hrSmtpTransporter = null;
let agentSmtpTransporter = null;

const MAX_ATTEMPTS_PER_CHANNEL = 1;
const RETRY_DELAY_MS = 350;
const SMTP_TIMEOUT_MS = config.smtpTimeoutMs || 25000;

const TRANSPORT_OPTS = {
  connectionTimeout: SMTP_TIMEOUT_MS,
  greetingTimeout: SMTP_TIMEOUT_MS,
  socketTimeout: SMTP_TIMEOUT_MS,
};

function normalizeRecipient(to) {
  const recipient = String(to || '').trim().toLowerCase();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return null;
  }
  return recipient;
}

function isAnyMailConfigured() {
  return Boolean(
    getHrOAuthAuth()
    || getAgentOAuthAuth()
    || (config.smtpUser && config.smtpPassword)
    || (config.agentSmtpUser && config.agentSmtpPassword),
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(reason = '') {
  const r = String(reason).toLowerCase();
  return r.includes('timeout')
    || r.includes('econnreset')
    || r.includes('rate')
    || r.includes('421')
    || r.includes('450')
    || r.includes('451')
    || r.includes('oauth')
    || r.includes('auth');
}

function resetTransporters(sender) {
  if (!sender || sender === 'hr') {
    hrTransporter = null;
    hrSmtpTransporter = null;
  }
  if (!sender || sender === 'agent') {
    agentTransporter = null;
    agentSmtpTransporter = null;
  }
}

function getHrTransporter() {
  if (hrTransporter) return hrTransporter;
  const oauth = getHrOAuthAuth();
  if (!oauth) return null;
  hrTransporter = nodemailer.createTransport({ service: 'gmail', auth: oauth, ...TRANSPORT_OPTS });
  return hrTransporter;
}

function getHrSmtpPasswordTransporter() {
  if (hrSmtpTransporter) return hrSmtpTransporter;
  if (!config.smtpUser || !config.smtpPassword) return null;
  hrSmtpTransporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
    ...TRANSPORT_OPTS,
  });
  return hrSmtpTransporter;
}

function getAgentTransporter() {
  if (agentTransporter) return agentTransporter;
  const oauth = getAgentOAuthAuth();
  if (oauth) {
    agentTransporter = nodemailer.createTransport({ service: 'gmail', auth: oauth, ...TRANSPORT_OPTS });
    return agentTransporter;
  }
  return getAgentSmtpPasswordTransporter();
}

function getAgentSmtpPasswordTransporter() {
  if (agentSmtpTransporter) return agentSmtpTransporter;
  if (!config.agentSmtpUser || !config.agentSmtpPassword) return null;
  agentSmtpTransporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.agentSmtpUser, pass: config.agentSmtpPassword },
    ...TRANSPORT_OPTS,
  });
  return agentSmtpTransporter;
}

async function sendViaTransport({
  transport, fromUser, fromLabel, to, subject, html, attachments, sender,
}) {
  if (!transport || !fromUser) {
    return { sent: false, reason: 'transport_not_configured', sender };
  }
  const recipient = normalizeRecipient(to) || to;
  try {
    const mail = {
      from: `${fromLabel} <${fromUser}>`,
      to: recipient,
      subject,
      html,
      replyTo: config.hrEmail || config.smtpUser || fromUser,
    };
    if (attachments?.length) {
      mail.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType || 'application/octet-stream',
      }));
    }
    await transport.sendMail(mail);
    console.log(`[email:${sender}] Sent from ${fromUser} to ${recipient}: ${subject}`);
    return { sent: true, sender, from: fromUser };
  } catch (err) {
    console.error(`[email:${sender}] Failed to ${recipient}:`, err.message);
    return { sent: false, reason: err.message, sender };
  }
}

/**
 * Try HR OAuth → Agent OAuth → HR app password → Agent app password with retries.
 * Maximizes delivery on deploy when one channel is missing or flaky.
 */
async function sendReliableEmail(to, subject, html, attachments = [], { prefer = 'hr' } = {}) {
  const recipient = normalizeRecipient(to);
  if (!recipient) return { sent: false, reason: 'invalid_recipient' };

  if (!isAnyMailConfigured()) {
    console.error('[email] No mail channel configured (HR/Agent OAuth or SMTP password required)');
    return { sent: false, reason: 'transport_not_configured' };
  }

  const channels = prefer === 'agent'
    ? [
      { id: 'agent_oauth', sender: 'agent', transport: () => getAgentTransporter(), user: config.agentSmtpUser, label: `${config.orgName} HR Agent` },
      { id: 'hr_oauth', sender: 'hr', transport: () => getHrTransporter(), user: config.smtpUser, label: `${config.orgName} Hiring` },
      { id: 'agent_smtp', sender: 'agent', transport: () => getAgentSmtpPasswordTransporter(), user: config.agentSmtpUser, label: `${config.orgName} HR Agent` },
      { id: 'hr_smtp', sender: 'hr', transport: () => getHrSmtpPasswordTransporter(), user: config.smtpUser, label: `${config.orgName} Hiring` },
    ]
    : [
      { id: 'hr_oauth', sender: 'hr', transport: () => getHrTransporter(), user: config.smtpUser, label: `${config.orgName} Hiring` },
      { id: 'agent_oauth', sender: 'agent', transport: () => getAgentTransporter(), user: config.agentSmtpUser, label: `${config.orgName} HR Agent` },
      { id: 'hr_smtp', sender: 'hr', transport: () => getHrSmtpPasswordTransporter(), user: config.smtpUser, label: `${config.orgName} Hiring` },
      { id: 'agent_smtp', sender: 'agent', transport: () => getAgentSmtpPasswordTransporter(), user: config.agentSmtpUser, label: `${config.orgName} HR Agent` },
    ];

  const errors = [];
  for (const ch of channels) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CHANNEL; attempt += 1) {
      const result = await sendViaTransport({
        transport: ch.transport(),
        fromUser: ch.user,
        fromLabel: ch.label,
        to: recipient,
        subject,
        html,
        attachments,
        sender: ch.sender,
      });
      if (result.sent) {
        return { ...result, channel: ch.id, attempts: attempt + 1 };
      }
      errors.push(`${ch.id}:${result.reason}`);
      if (isRetryableError(result.reason)) resetTransporters(ch.sender);
      if (attempt < MAX_ATTEMPTS_PER_CHANNEL - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  return { sent: false, reason: errors.join(' | ') || 'all_channels_failed' };
}

async function sendMail(opts) {
  const prefer = opts.sender === 'agent' ? 'agent' : 'hr';
  const result = await sendReliableEmail(opts.to, opts.subject, opts.html, opts.attachments, { prefer });
  return { ...result, sender: opts.sender };
}

async function sendHrEmail(to, subject, html, attachments = []) {
  return sendReliableEmail(to, subject, html, attachments, { prefer: 'hr' });
}

async function sendAgentEmail(to, subject, html, attachments = []) {
  return sendReliableEmail(to, subject, html, attachments, { prefer: 'agent' });
}

async function sendHrTemplateEmail(to, templateFn, data, attachments = []) {
  const { subject, html } = templateFn(data);
  return sendHrEmail(to, subject, html, attachments);
}

async function sendAgentTemplateEmail(to, templateFn, data, attachments = []) {
  const { subject, html } = templateFn(data);
  return sendAgentEmail(to, subject, html, attachments);
}

/** Leave / reimbursement → HR — all channels + retries */
async function sendNotifyHrEmail(to, subject, html, attachments = []) {
  return sendReliableEmail(to, subject, html, attachments, { prefer: 'agent' });
}

async function sendEmail(to, subject, html, attachments = []) {
  return sendHrEmail(to, subject, html, attachments);
}

async function sendTemplateEmail(to, templateFn, data, attachments = []) {
  return sendHrTemplateEmail(to, templateFn, data, attachments);
}

module.exports = {
  sendMail,
  sendReliableEmail,
  sendHrEmail,
  sendAgentEmail,
  sendHrTemplateEmail,
  sendAgentTemplateEmail,
  sendNotifyHrEmail,
  sendEmail,
  sendTemplateEmail,
  resetTransporters,
  normalizeRecipient,
  isAnyMailConfigured,
};
