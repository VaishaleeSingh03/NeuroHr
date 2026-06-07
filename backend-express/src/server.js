require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { connectDB, connectRedis } = require('./db');
const { runSeed } = require('./lib/seedMongo');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const screeningRoutes = require('./routes/screening');
const jobRoutes = require('./routes/jobs');
const interviewRoutes = require('./routes/interviews');
const attendanceRoutes = require('./routes/attendance');
const payrollRoutes = require('./routes/payroll');
const performanceRoutes = require('./routes/performance');
const analyticsRoutes = require('./routes/analytics');
const mlRoutes = require('./routes/ml');
const chatRoutes = require('./routes/chat');
const onboardingRoutes = require('./routes/onboarding');
const adminRoutes = require('./routes/admin');
const documentRoutes = require('./routes/documents');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

if (!fs.existsSync(config.uploadDir)) fs.mkdirSync(config.uploadDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(config.uploadDir));

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'NeuroHR AI Express API' }));
app.get('/api/v1/health', (_, res) => res.json({ status: 'ok', service: 'NeuroHR AI Express API' }));

const api = express.Router();
api.use('/auth', authRoutes);
api.use('/employees', employeeRoutes);
api.use('/screening', screeningRoutes);
api.use('/jobs', jobRoutes);
api.use('/interviews', interviewRoutes);
api.use('/attendance', attendanceRoutes);
api.use('/payroll', payrollRoutes);
api.use('/reimbursements', require('./routes/reimbursements'));
api.use('/performance', performanceRoutes);
api.use('/analytics', analyticsRoutes);
api.use('/ml', mlRoutes);
api.use('/chat', chatRoutes);
api.use('/onboarding', onboardingRoutes);
api.use('/admin', adminRoutes);
api.use('/documents', documentRoutes);
api.use('/notifications', require('./routes/notifications'));

app.use('/api/v1', api);

io.on('connection', (socket) => {
  socket.on('join', (room) => socket.join(room));
  socket.on('notify', (data) => io.to(data.room || 'all').emit('notification', data));
});

app.set('io', io);

process.on('unhandledRejection', (reason) => {
  console.error('[api] Unhandled promise rejection (server stays up):', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[api] Uncaught exception:', err);
});

async function start() {
  await connectDB();
  await connectRedis();
  if (process.env.AUTO_SEED !== 'false') {
    try {
      await runSeed({ force: false });
    } catch (err) {
      console.warn('Auto-seed skipped:', err.message);
    }
  }
  server.listen(config.port, () => {
    console.log(`NeuroHR AI API running on http://localhost:${config.port}`);
    wakeMlService();
  });
}

/** Reduce Render cold-start delay for screening/JD/interview analysis. */
function wakeMlService() {
  const url = `${config.mlServiceUrl.replace(/\/$/, '')}/health`;
  require('axios').get(url, { timeout: 8000 })
    .then(() => console.log('[ml] Warm-up ping OK'))
    .catch((err) => console.warn('[ml] Warm-up ping failed:', err.message));
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
