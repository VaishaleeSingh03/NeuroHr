const { Candidate, JobApplication, getNextSeq } = require('../models');
const { normalizeEmail } = require('./emailUtils');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findCandidateForUser(user) {
  if (!user) return null;
  const email = normalizeEmail(user.email);
  let candidate = await Candidate.findOne({
    $or: [
      { userId: user.id },
      ...(email ? [{ email: new RegExp(`^${escapeRegex(email)}$`, 'i') }] : []),
    ],
  });
  return candidate;
}

async function ensureCandidateForUser(user) {
  let candidate = await findCandidateForUser(user);
  if (candidate) {
    if (!candidate.userId) {
      candidate.userId = user.id;
      if (user.email) candidate.email = normalizeEmail(user.email) || candidate.email;
      await candidate.save();
    }
    return candidate;
  }

  const app = await JobApplication.findOne({ userId: user.id }).sort({ appliedAt: -1 });
  if (app?.candidateId) {
    candidate = await Candidate.findOne({ id: app.candidateId });
    if (candidate) {
      candidate.userId = user.id;
      candidate.email = normalizeEmail(user.email) || candidate.email;
      await candidate.save();
      return candidate;
    }
  }

  const id = await getNextSeq('candidates');
  candidate = await Candidate.create({
    id,
    userId: user.id,
    name: user.name,
    email: normalizeEmail(user.email) || user.email,
    status: 'applied',
    source: 'user_profile',
  });
  return candidate;
}

function interviewFilterForUser(user, candidate, extraCandidateIds = []) {
  const email = normalizeEmail(user.email);
  const or = [{ userId: user.id }];
  if (email) {
    or.push({ candidateEmail: new RegExp(`^${escapeRegex(email)}$`, 'i') });
  }
  const candidateIds = new Set(
    [candidate?.id, ...extraCandidateIds].filter((id) => id != null),
  );
  candidateIds.forEach((id) => or.push({ candidateId: id }));
  return { $or: or };
}

async function buildInterviewFilterForUser(user) {
  const candidate = await ensureCandidateForUser(user);
  const fromApps = await JobApplication.find({ userId: user.id }).distinct('candidateId');
  return interviewFilterForUser(user, candidate, fromApps);
}

async function findCandidateUserIdByEmails(emails) {
  const { User } = require('../models');
  const unique = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  for (const email of unique) {
    const user = await User.findOne({
      role: 'candidate',
      email: new RegExp(`^${escapeRegex(email)}$`, 'i'),
    }).lean();
    if (user) return user.id;
  }
  return null;
}

async function resolveUserIdForCandidate(candidate, application) {
  if (application?.userId) return application.userId;
  if (candidate?.userId) return candidate.userId;
  if (candidate?.id) {
    const app = await JobApplication.findOne({ candidateId: candidate.id })
      .sort({ appliedAt: -1 })
      .lean();
    if (app?.userId) return app.userId;
  }
  return findCandidateUserIdByEmails([
    candidate?.email,
    candidate?.contactEmail,
    application?.candidateEmail,
  ]);
}

async function resolveUserIdForInterview(interview, candidate, application) {
  if (interview?.userId) return interview.userId;
  if (application?.userId) return application.userId;
  const linked = await resolveUserIdForCandidate(candidate, application);
  if (linked) return linked;
  return findCandidateUserIdByEmails([
    interview?.candidateEmail,
    application?.candidateEmail,
    candidate?.email,
    candidate?.contactEmail,
  ]);
}

module.exports = {
  findCandidateForUser,
  ensureCandidateForUser,
  interviewFilterForUser,
  buildInterviewFilterForUser,
  resolveUserIdForCandidate,
  resolveUserIdForInterview,
  normalizeEmail,
};
