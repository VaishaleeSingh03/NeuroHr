/**
 * Verify HR + Agent mail and HR Google Calendar access.
 * Usage: cd backend-express && node scripts/verify-mail-calendar.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const config = require('../src/config');
const { getAgentOAuthAuth } = require('../src/lib/agentMailAuth');
const { getHrOAuthAuth, tokenHasMailScope } = require('../src/lib/hrMailAuth');
const { isCalendarConfigured, loadOAuthClient, SCOPES } = require('../src/lib/googleCalendar');

function resolvePath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

async function verifySmtp(label, user, password) {
  if (!user || !password) {
    return { ok: false, reason: 'missing SMTP_USER or SMTP_PASSWORD' };
  }
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user, pass: password },
  });
  try {
    await transport.verify();
    return { ok: true, user, method: 'smtp' };
  } catch (err) {
    return { ok: false, user, method: 'smtp', reason: err.message };
  }
}

async function verifyAgentMail() {
  const oauth = getAgentOAuthAuth();
  if (oauth) {
    const transport = nodemailer.createTransport({ service: 'gmail', auth: oauth });
    try {
      await transport.verify();
      return { ok: true, user: config.agentSmtpUser, method: 'gmail_oauth' };
    } catch (err) {
      return { ok: false, user: config.agentSmtpUser, method: 'gmail_oauth', reason: err.message };
    }
  }
  return verifySmtp('Agent', config.agentSmtpUser, config.agentSmtpPassword);
}

async function verifyHrCalendar() {
  const credPath = resolvePath(config.googleCalendarCredentials);
  const tokenPath = resolvePath(config.googleCalendarToken);
  if (!fs.existsSync(credPath)) {
    return { ok: false, reason: `missing ${credPath}` };
  }
  if (!fs.existsSync(tokenPath)) {
    return {
      ok: false,
      reason: `missing ${tokenPath} — run: node scripts/google-calendar-auth.js`,
    };
  }
  const client = loadOAuthClient();
  if (!client) {
    return { ok: false, reason: 'OAuth client could not load token' };
  }
  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const { data } = await calendar.calendarList.list({ maxResults: 1 });
    return {
      ok: true,
      calendars: data.items?.length || 0,
      scopes: SCOPES,
      credentials: credPath,
      token: tokenPath,
    };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function verifyHrMail() {
  const credPath = resolvePath(config.googleCalendarCredentials);
  const tokenPath = resolvePath(config.googleCalendarToken);
  if (!fs.existsSync(credPath)) {
    return {
      ok: false,
      user: config.smtpUser,
      method: 'gmail_oauth',
      reason: `missing ${credPath}`,
    };
  }
  if (!fs.existsSync(tokenPath)) {
    return {
      ok: false,
      user: config.smtpUser,
      method: 'gmail_oauth',
      reason: 'missing token.json — run: npm run auth:calendar',
    };
  }

  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  if (!tokenHasMailScope(tokens)) {
    return {
      ok: false,
      user: config.smtpUser,
      method: 'gmail_oauth',
      reason: 'token.json missing mail.google.com scope — run: npm run auth:calendar',
    };
  }

  const oauth = getHrOAuthAuth();
  if (!oauth) {
    return {
      ok: false,
      user: config.smtpUser,
      method: 'gmail_oauth',
      reason: 'HR OAuth not ready — run: npm run auth:calendar',
    };
  }

  const transport = nodemailer.createTransport({ service: 'gmail', auth: oauth });
  try {
    await transport.verify();
    return { ok: true, user: config.smtpUser, method: 'gmail_oauth (same token as Calendar)' };
  } catch (err) {
    return { ok: false, user: config.smtpUser, method: 'gmail_oauth', reason: err.message };
  }
}

async function main() {
  console.log('\n=== NeuroHR Mail & Calendar Verification ===\n');

  const hrCreds = resolvePath(config.googleCalendarCredentials);
  const hrToken = resolvePath(config.googleCalendarToken);
  console.log('HR MAIL (vaishaleeaiml — interviews, offers, payslips)');
  console.log(`  OAuth JSON: ${hrCreds} ${fs.existsSync(hrCreds) ? '✓' : '✗'}`);
  console.log(`  OAuth token: ${hrToken} ${fs.existsSync(hrToken) ? '✓' : '✗ (run: npm run auth:calendar)'}`);
  const hrMail = await verifyHrMail();
  console.log(hrMail.ok
    ? `  OK — ${hrMail.method} verified for ${hrMail.user}`
    : `  FAIL — ${hrMail.method || 'smtp'}: ${hrMail.reason}`);

  const agentCreds = resolvePath(config.googleAgentCredentials);
  const agentToken = resolvePath(config.googleAgentToken);
  console.log('\nAGENT MAIL (vaishaleeagent — leave, offer acceptance → HR)');
  console.log(`  OAuth JSON: ${agentCreds} ${fs.existsSync(agentCreds) ? '✓' : '✗'}`);
  console.log(`  OAuth token: ${agentToken} ${fs.existsSync(agentToken) ? '✓' : '✗ (run: node scripts/agent-google-auth.js)'}`);
  const agentMail = await verifyAgentMail();
  console.log(agentMail.ok
    ? `  OK — ${agentMail.method} verified for ${agentMail.user}`
    : `  FAIL — ${agentMail.method}: ${agentMail.reason}`);

  console.log('\nHR GOOGLE CALENDAR + MEET (human panel)');
  const cal = await verifyHrCalendar();
  console.log(cal.ok
    ? `  OK — Calendar API access (${cal.calendars} calendar(s)), scope: ${cal.scopes.join(', ')}`
    : `  FAIL — ${cal.reason}`);

  console.log('\nAGENT CALENDAR');
  console.log('  N/A — Agent account is mail-only (notifications to HR). Calendar uses HR credentials.\n');

  const allOk = hrMail.ok && agentMail.ok && cal.ok;
  if (!allOk) {
    console.log('Fix failures above, then restart backend-express.\n');
    process.exit(1);
  }
  console.log('All checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
