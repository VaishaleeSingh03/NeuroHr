/**
 * One-time Google Calendar OAuth — like great-harness-agent credentials.json + token.json flow.
 * Usage: npm run auth:calendar
 * Place credentials.json in backend-express/ (Google Cloud OAuth client).
 * Scopes: Calendar + Gmail send (same token for Meet links and HR mail).
 * Re-run after scope changes — replaces token.json.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const http = require('http');
const { google } = require('googleapis');
const { SCOPES } = require('../src/lib/googleCalendar');

const CREDENTIALS = process.env.GOOGLE_CALENDAR_CREDENTIALS
  || path.join(__dirname, '../credentials.json');
const TOKEN = process.env.GOOGLE_CALENDAR_TOKEN
  || path.join(__dirname, '../token.json');
const PORT = parseInt(process.env.GOOGLE_OAUTH_PORT || '9090', 10);

if (!fs.existsSync(CREDENTIALS)) {
  console.error(`Missing ${CREDENTIALS}`);
  console.error('Download OAuth client JSON from Google Cloud Console and save as credentials.json');
  process.exit(1);
}

const keys = JSON.parse(fs.readFileSync(CREDENTIALS, 'utf8'));
const block = keys.installed || keys.web;
const oAuth2Client = new google.auth.OAuth2(
  block.client_id,
  block.client_secret,
  `http://localhost:${PORT}/oauth2callback`,
);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('Authorize this app by visiting:\n', authUrl);

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/oauth2callback')) {
    res.writeHead(404);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  if (!code) {
    res.end('No code');
    return;
  }
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    fs.writeFileSync(TOKEN, JSON.stringify(tokens, null, 2));
    res.end('Authentication successful! You can close this tab. token.json saved.');
    console.log(`Saved token to ${TOKEN}`);
    server.close();
    process.exit(0);
  } catch (err) {
    res.end(`Auth failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Waiting for OAuth callback on http://localhost:${PORT}/oauth2callback`);
});
