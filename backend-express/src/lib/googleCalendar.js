/**
 * Google Calendar + Meet — port of great-harness-agent app/integrations/calendar.py
 * Requires credentials.json + token.json (run: node scripts/google-calendar-auth.js)
 */

const { google } = require('googleapis');
const config = require('../config');
const { loadJsonFromEnvOrFile, resolvePath } = require('./oauthEnv');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://mail.google.com/',
];

function loadOAuthClient() {
  const keys = loadJsonFromEnvOrFile(
    'GOOGLE_CALENDAR_CREDENTIALS_JSON',
    config.googleCalendarCredentials,
  );
  const block = keys?.installed || keys?.web;
  if (!block) return null;

  const client = new google.auth.OAuth2(
    block.client_id,
    block.client_secret,
    (block.redirect_uris && block.redirect_uris[0]) || 'http://localhost:9090/oauth2callback',
  );

  const tokens = loadJsonFromEnvOrFile('GOOGLE_CALENDAR_TOKEN_JSON', config.googleCalendarToken);
  if (!tokens) return null;
  client.setCredentials(tokens);
  return client;
}

function parseStartDateTime(date, time) {
  const combined = `${date} ${time}`.trim();
  const formats = [
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/,
    /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}\s?[AP]M)$/i,
  ];
  for (const re of formats) {
    const m = combined.match(re);
    if (m) {
      const d = new Date(`${m[1]}T${normalizeTime(m[2])}`);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const fallback = new Date(`${date}T15:00:00`);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

function normalizeTime(t) {
  const upper = t.trim().toUpperCase();
  if (/AM|PM/.test(upper)) {
    const [timePart, meridiem] = upper.split(/\s+/);
    let [h, min] = timePart.split(':').map(Number);
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(min || 0).padStart(2, '0')}:00`;
  }
  return `${t}:00`.replace(/:+/g, ':');
}

function formatLocalIso(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function createInterviewEvent({
  candidateName,
  candidateEmail,
  interviewers = [],
  date,
  time,
  durationMinutes = 60,
  jobTitle = 'Position',
  description = '',
}) {
  const auth = loadOAuthClient();
  if (!auth) {
    return { error: 'Calendar service unavailable — add credentials.json and token.json', meet_link: '' };
  }

  const calendar = google.calendar({ version: 'v3', auth });
  const startDt = parseStartDateTime(date, time);
  const endDt = new Date(startDt.getTime() + durationMinutes * 60 * 1000);

  const attendees = [];
  if (candidateEmail && candidateEmail.includes('@')) {
    attendees.push({ email: candidateEmail, displayName: candidateName || 'Candidate' });
  }
  for (const interviewer of interviewers) {
    if (interviewer.email && interviewer.email.includes('@')) {
      attendees.push({
        email: interviewer.email,
        displayName: interviewer.name || interviewer.email,
      });
    }
  }
  if (!attendees.length) {
    return { error: 'No valid email addresses for attendees', meet_link: '' };
  }

  const slug = String(candidateName || 'candidate').toLowerCase().replace(/\s+/g, '-').slice(0, 40);
  const event = {
    summary: `Technical Interview: ${candidateName} — ${jobTitle}`,
    description: `Final technical interview for ${candidateName}\n\n${description}`.trim(),
    start: {
      dateTime: formatLocalIso(startDt),
      timeZone: config.calendarTimeZone,
    },
    end: {
      dateTime: formatLocalIso(endDt),
      timeZone: config.calendarTimeZone,
    },
    attendees,
    conferenceData: {
      createRequest: {
        requestId: `interview-${slug}-${date}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 15 },
      ],
    },
  };

  try {
    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
    });

    let meetLink = '';
    const entryPoints = result.data.conferenceData?.entryPoints || [];
    for (const ep of entryPoints) {
      if (ep.entryPointType === 'video' && ep.uri) {
        meetLink = ep.uri;
        break;
      }
    }

    console.log(`[calendar] Event created — Meet: ${meetLink || 'none'}`);
    return {
      event_id: result.data.id || '',
      html_link: result.data.htmlLink || '',
      meet_link: meetLink,
      status: 'created',
    };
  } catch (err) {
    console.error('[calendar] Event creation failed:', err.message);
    return { error: err.message, meet_link: '' };
  }
}

function isCalendarConfigured() {
  return Boolean(
    loadJsonFromEnvOrFile('GOOGLE_CALENDAR_CREDENTIALS_JSON', config.googleCalendarCredentials)
    && loadJsonFromEnvOrFile('GOOGLE_CALENDAR_TOKEN_JSON', config.googleCalendarToken),
  );
}

module.exports = { createInterviewEvent, isCalendarConfigured, loadOAuthClient, SCOPES };
