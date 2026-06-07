const STATUS_PRIORITY = {
  scheduled: 50,
  analyzing: 40,
  completed: 30,
  expired: 20,
  failed: 10,
};

function roleKey(item) {
  if (item.candidateId != null && item.jobId != null) {
    return `${item.candidateId}-${item.jobId}`;
  }
  return `id-${item.id}`;
}

function effectivePriority(item, isPastDeadline) {
  if (item.status === 'scheduled' && isPastDeadline?.(item)) {
    return STATUS_PRIORITY.expired;
  }
  if (item.status === 'scheduled' && item.can_start) {
    return STATUS_PRIORITY.scheduled + 5;
  }
  return STATUS_PRIORITY[item.status] || 0;
}

function dedupeInterviewsByRole(items, isPastDeadline = null) {
  const byKey = new Map();
  for (const item of items) {
    const key = roleKey(item);
    const existing = byKey.get(key);
    const pri = effectivePriority(item, isPastDeadline);
    const existingPri = existing ? effectivePriority(existing, isPastDeadline) : -1;
    if (!existing || pri > existingPri
      || (pri === existingPri && (item.id || 0) > (existing.id || 0))) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const da = new Date(a.scheduledAt || a.createdAt || 0).getTime();
    const db = new Date(b.scheduledAt || b.createdAt || 0).getTime();
    return db - da;
  });
}

async function assertCanScheduleInterview(Interview, candidateId, jobId, isPastDeadline) {
  const existing = await Interview.find({ candidateId, jobId }).sort({ id: -1 }).lean();
  for (const item of existing) {
    if (item.status === 'completed') {
      const err = new Error('This candidate already completed an interview for this role. Only one attempt is allowed.');
      err.status = 409;
      throw err;
    }
    if (item.status === 'analyzing') {
      const err = new Error('Interview submitted and is being analyzed. Only one attempt is allowed.');
      err.status = 409;
      throw err;
    }
    if (item.status === 'in_progress') {
      const err = new Error('Candidate has already started this interview. Only one attempt is allowed.');
      err.status = 409;
      throw err;
    }
    if (item.status === 'failed') {
      const err = new Error('This candidate already used their interview attempt for this role.');
      err.status = 409;
      throw err;
    }
    if (item.status === 'scheduled' && !isPastDeadline(item)) {
      const err = new Error('An interview is already scheduled for this candidate and role.');
      err.status = 409;
      err.existingInterviewId = item.id;
      throw err;
    }
  }
}

function summarizeInterviewForClient(interview) {
  if (!interview) return null;
  return {
    id: interview.id,
    status: interview.status,
    analysisStatus: interview.analysisStatus,
    finalScore: interview.finalScore,
    interviewScore: interview.interviewScore,
    compositeScore: interview.compositeScore,
    screeningScore: interview.screeningScore,
    technicalScore: interview.technicalScore,
    communicationScore: interview.communicationScore,
    problemSolvingScore: interview.problemSolvingScore,
    cultureFitScore: interview.cultureFitScore,
    experienceDepthScore: interview.experienceDepthScore,
    jdAlignmentScore: interview.jdAlignmentScore,
    verdict: interview.verdict,
    shortlistVerdict: interview.shortlistVerdict,
    recommendation: interview.recommendation,
    evaluationMethod: interview.evaluationMethod,
    topStrengths: interview.topStrengths,
    concerns: interview.concerns,
    topStrengths: interview.topStrengths,
    concerns: interview.concerns,
    evaluationMethod: interview.evaluationMethod,
    aiFeedback: interview.aiFeedback,
    completedAt: interview.completedAt,
    scheduledAt: interview.scheduledAt,
    deadlineAt: interview.deadlineAt,
    durationMinutes: interview.durationMinutes,
    startedAt: interview.startedAt,
    attemptUsed: ['completed', 'analyzing', 'failed'].includes(interview.status)
      || (interview.status === 'in_progress' && !!interview.startedAt),
  };
}

module.exports = {
  dedupeInterviewsByRole,
  assertCanScheduleInterview,
  summarizeInterviewForClient,
};
