/**
 * HR Gmail OAuth — same credentials.json + token.json as Google Calendar.
 * No app password. Re-auth: npm run auth:calendar (Calendar + Gmail scopes).
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { loadOAuthClient } = require('./googleCalendar');

function resolvePath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function loadHrOAuthBlock() {
  const credPath = resolvePath(config.googleCalendarCredentials);
  if (!credPath || !fs.existsSync(credPath)) return null;
  const keys = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  return keys.installed || keys.web || null;
}

function loadHrOAuthTokens() {
  const tokenPath = resolvePath(config.googleCalendarToken);
  if (!tokenPath || !fs.existsSync(tokenPath)) return null;
  return JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
}

function tokenHasMailScope(tokens) {
  const scope = String(tokens?.scope || '');
  return scope.includes('mail.google.com');
}

function isHrOAuthMailConfigured() {
  const block = loadHrOAuthBlock();
  const tokens = loadHrOAuthTokens();
  return !!(
    block?.client_id
    && block?.client_secret
    && tokens?.refresh_token
    && tokenHasMailScope(tokens)
    && config.smtpUser
  );
}

function getHrOAuthAuth() {
  if (!config.smtpUser) return null;

  const block = loadHrOAuthBlock();
  const tokens = loadHrOAuthTokens();
  if (!block?.client_id || !block?.client_secret || !tokens?.refresh_token) return null;
  if (!tokenHasMailScope(tokens)) return null;

  // Prefer in-memory client credentials (keeps refresh in sync with Calendar).
  const client = loadOAuthClient();
  const creds = client?.credentials || tokens;

  return {
    type: 'OAuth2',
    user: config.smtpUser,
    clientId: block.client_id,
    clientSecret: block.client_secret,
    refreshToken: creds.refresh_token,
    accessToken: creds.access_token,
  };
}

module.exports = {
  loadHrOAuthBlock,
  loadHrOAuthTokens,
  isHrOAuthMailConfigured,
  getHrOAuthAuth,
  tokenHasMailScope,
};
