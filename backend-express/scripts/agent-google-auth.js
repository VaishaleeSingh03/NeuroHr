/**
 * One-time Agent Gmail OAuth — uses credentials-1.json (agent mail).
 * Usage: cd backend-express && node scripts/agent-google-auth.js
 * Sign in as vaishaleeagent@gmail.com when prompted.
 * Add redirect URI in Google Cloud (agent project): http://localhost:9091/oauth2callback
 * Re-run after scope changes — deletes old agent-token.json first if present.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const http = require('http');
const { google } = require('googleapis');
const { AGENT_GMAIL_SCOPES } = require('../src/lib/agentMailAuth');

const CREDENTIALS = process.env.GOOGLE_AGENT_CREDENTIALS
  || path.join(__dirname, '../credentials-1.json');
const TOKEN = process.env.GOOGLE_AGENT_TOKEN
  || path.join(__dirname, '../agent-token.json');
const PORT = parseInt(process.env.AGENT_OAUTH_PORT || '9091', 10);
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;

if (!fs.existsSync(CREDENTIALS)) {
  console.error(`Missing agent credentials: ${CREDENTIALS}`);
  console.error('Place your agent OAuth JSON as backend-express/credentials-1.json');
  process.exit(1);
}

const keys = JSON.parse(fs.readFileSync(CREDENTIALS, 'utf8'));
const block = keys.installed || keys.web;
const oAuth2Client = new google.auth.OAuth2(
  block.client_id,
  block.client_secret,
  REDIRECT,
);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: AGENT_GMAIL_SCOPES,
  prompt: 'consent',
});

console.log('\n=== Agent Gmail OAuth (vaishaleeagent@gmail.com) ===');
console.log('Add this redirect URI in Google Cloud Console (agent project):');
console.log(`  ${REDIRECT}\n`);
console.log('Open this URL and sign in with the AGENT Gmail account:\n', authUrl);

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/oauth2callback')) {
    res.writeHead(404);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  if (!code) {
    res.end('No code received');
    return;
  }
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    fs.writeFileSync(TOKEN, JSON.stringify(tokens, null, 2));
    res.end('Agent Gmail auth successful! Close this tab. agent-token.json saved.');
    console.log(`\nSaved agent token to ${TOKEN}`);
    server.close();
    process.exit(0);
  } catch (err) {
    res.end(`Auth failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Waiting for callback on ${REDIRECT}\n`);
});
