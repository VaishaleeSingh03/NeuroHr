require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

if (!process.env.JWT_SECRET?.trim()) {
  throw new Error(
    'JWT_SECRET is required. Set JWT_SECRET in the project root .env (see .env.example).',
  );
}

module.exports = {
  port: process.env.PORT || 8000,
  mongoUri: process.env.MONGODB_URL || 'mongodb://localhost:27017/neurohr_ai',
  mongoDb: process.env.MONGODB_DB || 'neurohr_ai',
  jwtSecret: process.env.JWT_SECRET.trim(),
  jwtExpires: process.env.JWT_EXPIRES || '24h',
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8001',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  agentSmtpUser: process.env.AGENT_SMTP_USER || '',
  agentSmtpPassword: process.env.AGENT_SMTP_PASSWORD || '',
  hrEmail: process.env.HR_EMAIL || process.env.SMTP_USER || '',
  googleAgentCredentials: process.env.GOOGLE_AGENT_CREDENTIALS || './credentials-1.json',
  googleAgentToken: process.env.GOOGLE_AGENT_TOKEN || './agent-token.json',
  orgName: process.env.ORG_NAME || 'XYZ',
  googleCalendarCredentials: process.env.GOOGLE_CALENDAR_CREDENTIALS || './credentials.json',
  googleCalendarToken: process.env.GOOGLE_CALENDAR_TOKEN || './token.json',
  calendarTimeZone: process.env.CALENDAR_TIMEZONE || 'Asia/Kolkata',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '50', 10),
};
