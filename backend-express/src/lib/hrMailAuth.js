/**
 * HR Gmail OAuth — same credentials.json + token.json as Google Calendar.
 * No app password. Re-auth: npm run auth:calendar (Calendar + Gmail scopes).
 */

const config = require('../config');
const { loadOAuthClient } = require('./googleCalendar');
const { loadJsonFromEnvOrFile } = require('./oauthEnv');

function loadHrOAuthBlock() {
  const keys = loadJsonFromEnvOrFile(
    'GOOGLE_CALENDAR_CREDENTIALS_JSON',
    config.googleCalendarCredentials,
  );
  if (!keys) return null;
  return keys.installed || keys.web || null;
}

function loadHrOAuthTokens() {
  return loadJsonFromEnvOrFile('GOOGLE_CALENDAR_TOKEN_JSON', config.googleCalendarToken);
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
