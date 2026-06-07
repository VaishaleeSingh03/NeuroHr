const express = require('express');
const { auth } = require('../middleware/auth');
const { ChatHistory, Candidate, Employee, JobApplication, Interview, getNextSeq } = require('../models');
const { buildInterviewFilterForUser } = require('../lib/candidateLink');
const ml = require('../services/mlClient');
const { STAFF_ROLES } = require('../lib/roles');

const router = express.Router();

async function buildChatContext(user) {
  let text = '';
  let candidatePayload = [];

  if (STAFF_ROLES.includes(user.role)) {
    const candidates = await Candidate.find().sort({ rankingScore: -1 }).limit(20).lean();
    candidatePayload = candidates.map((c) => ({
      name: c.name,
      ai_score: c.rankingScore ?? c.matchScore ?? 0,
      skills: c.skills || [],
      status: c.status,
      job_id: c.jobId,
    }));
    const top = candidatePayload.slice(0, 5);
    text = top.length
      ? `Top candidates: ${top.map((c) => `${c.name} (${c.ai_score}%)`).join(', ')}`
      : 'No candidates in the system yet.';
  } else if (user.role === 'employee') {
    const emp = await Employee.findOne({ 'personalDetails.email': user.email }).lean();
    text = emp
      ? `Employee profile: ${emp.personalDetails?.name}, ${emp.designation}, dept ${emp.department}, skills: ${(emp.skills || []).join(', ')}`
      : `Employee user: ${user.name}`;
  } else if (user.role === 'candidate') {
    const filter = await buildInterviewFilterForUser(user);
    const [applications, interviews] = await Promise.all([
      JobApplication.find({
        $or: [{ userId: user.id }],
      }).sort({ appliedAt: -1 }).limit(5).lean(),
      Interview.find(filter).sort({ scheduledAt: -1 }).limit(3).lean(),
    ]);
    const appSummary = applications.length
      ? applications.map((a) => `${a.jobTitle} (${a.status})`).join(', ')
      : 'No applications yet';
    const interviewSummary = interviews.length
      ? interviews.map((i) => `${i.jobTitle} — ${i.status}`).join(', ')
      : 'No interviews scheduled';
    text = `Candidate: ${user.name}. Applications: ${appSummary}. Interviews: ${interviewSummary}.`;
  }

  return { role: user.role, text, candidates: candidatePayload };
}

router.post('/message', auth(), async (req, res) => {
  const { message, session_id } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  let reply = '';
  let suggestions = [];
  let action = 'help';

  try {
    const context = await buildChatContext(req.user);
    const response = await ml.chat(message, context);
    reply = response.response || response.reply || '';
    suggestions = response.suggestions || [];
    action = response.action || 'help';
  } catch (err) {
    console.error('Chat ML error:', err.message);
    reply = 'The AI assistant is temporarily unavailable. Please ensure the ML service is running on port 8001, then try again.';
  }

  if (!reply) {
    reply = req.user.role === 'candidate'
      ? 'I could not generate a response. Try asking about interview prep, applications, or job search tips.'
      : req.user.role === 'employee'
        ? 'I could not generate a response. Try asking about leave, payroll, or career growth.'
        : 'I could not generate a response. Try asking about candidates, interviews, or onboarding.';
  }

  const sid = session_id || `session_${req.user.id}`;
  let history = await ChatHistory.findOne({ userId: req.user.id, sessionId: sid });
  if (!history) {
    const id = await getNextSeq('chat');
    history = await ChatHistory.create({ id, userId: req.user.id, sessionId: sid, messages: [], aiResponses: [] });
  }
  history.messages.push({ role: 'user', content: message, timestamp: new Date() });
  history.aiResponses.push(reply);
  await history.save();

  res.json({ reply, response: reply, suggestions, action, session_id: sid });
});

router.get('/history', auth(), async (req, res) => {
  res.json(await ChatHistory.find({ userId: req.user.id }).sort({ updatedAt: -1 }).limit(10).lean());
});

module.exports = router;
