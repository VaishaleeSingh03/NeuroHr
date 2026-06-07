const INTERVIEW_PASS_THRESHOLD = 80;
const SCREENING_PASS_THRESHOLD = INTERVIEW_PASS_THRESHOLD;

function isScreeningRejection(jdScore) {
  return jdScore != null && Number(jdScore) < SCREENING_PASS_THRESHOLD;
}

function isInterviewRejection(recommendation, finalScore) {
  if (finalScore != null && Number(finalScore) < INTERVIEW_PASS_THRESHOLD) return true;
  const rec = String(recommendation || '').trim().toLowerCase();
  if (rec === 'reject') return true;
  return false;
}

function isInterviewPassed(interview) {
  if (!interview || interview.status !== 'completed') return false;
  return !isInterviewRejection(interview.recommendation, interview.finalScore);
}

const AI_INTERVIEW_SCHEDULE_STATUSES = ['shortlisted'];

function canScheduleInterviewForApplication(application) {
  if (!application) return false;
  if (application.status === 'rejected') return false;
  return AI_INTERVIEW_SCHEDULE_STATUSES.includes(application.status);
}

module.exports = {
  INTERVIEW_PASS_THRESHOLD,
  SCREENING_PASS_THRESHOLD,
  isScreeningRejection,
  isInterviewRejection,
  isInterviewPassed,
  canScheduleInterviewForApplication,
};
