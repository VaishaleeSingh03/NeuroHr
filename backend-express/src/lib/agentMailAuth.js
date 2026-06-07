/**
 * Agent Gmail OAuth — uses credentials-1.json + agent-token.json
 * Fallback: AGENT_SMTP_USER + AGENT_SMTP_PASSWORD in .env
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

function resolvePath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function loadAgentOAuthBlock() {
  const credPath = resolvePath(config.googleAgentCredentials);
  if (!credPath || !fs.existsSync(credPath)) return null;
  const keys = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  return keys.installed || keys.web || null;
}

function loadAgentOAuthTokens() {
  const tokenPath = resolvePath(config.googleAgentToken);
  if (!tokenPath || !fs.existsSync(tokenPath)) return null;
  return JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
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
