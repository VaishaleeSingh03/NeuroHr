/**
 * Agent Gmail OAuth — uses credentials-1.json + agent-token.json
 * Fallback: AGENT_SMTP_USER + AGENT_SMTP_PASSWORD in .env
 */

const config = require('../config');
const { loadJsonFromEnvOrFile } = require('./oauthEnv');

function loadAgentOAuthBlock() {
  const keys = loadJsonFromEnvOrFile(
    'GOOGLE_AGENT_CREDENTIALS_JSON',
    config.googleAgentCredentials,
  );
  if (!keys) return null;
  return keys.installed || keys.web || null;
}

function loadAgentOAuthTokens() {
  return loadJsonFromEnvOrFile('GOOGLE_AGENT_TOKEN_JSON', config.googleAgentToken);
}

function isAgentOAuthConfigured() {
  const block = loadAgentOAuthBlock();
  const tokens = loadAgentOAuthTokens();
  return !!(block?.client_id && block?.client_secret && tokens?.refresh_token && config.agentSmtpUser);
}

function getAgentOAuthAuth() {
  if (!isAgentOAuthConfigured()) return null;
  const block = loadAgentOAuthBlock();
  const tokens = loadAgentOAuthTokens();
  return {
    type: 'OAuth2',
    user: config.agentSmtpUser,
    clientId: block.client_id,
    clientSecret: block.client_secret,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
  };
}

module.exports = {
  loadAgentOAuthBlock,
  loadAgentOAuthTokens,
  isAgentOAuthConfigured,
  getAgentOAuthAuth,
  // SMTP + nodemailer XOAUTH2 requires mail.google.com (gmail.send is API-only).
  AGENT_GMAIL_SCOPES: ['https://mail.google.com/'],
};
