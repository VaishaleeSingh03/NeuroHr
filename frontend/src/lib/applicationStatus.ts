export const INTERVIEW_PASS_THRESHOLD = 80;
export const SCREENING_PASS_THRESHOLD = INTERVIEW_PASS_THRESHOLD;

export function formatApplicationStatus(status: string): string {
  const s = String(status || "unknown");
  if (s === "employee") return "Employee";
  if (s === "hired") return "Hired";
  if (s === "offer_pending") return "Offer pending";
  if (s === "offer_declined") return "Offer declined";
  if (s === "human_interview_completed") return "Panel complete";
  return s.replace(/_/g, " ");
}

/** Advisory only — does not mean HR rejected. */
export function isInterviewBelowThreshold(
  recommendation?: string | null,
  finalScore?: number | null,
): boolean {
  if (finalScore != null && finalScore < INTERVIEW_PASS_THRESHOLD) return true;
  const rec = String(recommendation || "").trim().toLowerCase();
  if (rec === "reject") return true;
  return false;
}

export function isInterviewPassed(
  recommendation?: string | null,
  finalScore?: number | null,
): boolean {
  return !isInterviewBelowThreshold(recommendation, finalScore);
}

/** True only when HR explicitly rejected (not score-based). */
export function isApplicationRejected(
  status?: string,
  _interview?: { status?: string; recommendation?: string; finalScore?: number } | null,
): boolean {
  return status === "rejected";
}

export const REJECTED_CANDIDATE_MESSAGE =
  "Your application was not selected to move forward.";

export const REJECTED_RECRUITER_MESSAGE =
  "Application rejected by HR.";

export const REJECTED_SCREENING_CANDIDATE_MESSAGE =
  "Your application was not selected to move forward after resume review.";

export const REJECTED_SCREENING_RECRUITER_MESSAGE =
  "Application rejected by HR after resume review.";

/** Advisory — score below recommended threshold; HR still decides. */
export function isScreeningRejected(jdScore?: number | null): boolean {
  return jdScore != null && jdScore < SCREENING_PASS_THRESHOLD;
}

export const AI_INTERVIEW_SCHEDULE_STATUSES = ["shortlisted"] as const;

export const AI_INTERVIEW_PIPELINE_STATUSES = [
  "shortlisted",
  "interview_scheduled",
  "interview_submitted",
  "interview_completed",
  "human_interview_scheduled",
] as const;

export function isShortlistedForInterview(status?: string): boolean {
  return AI_INTERVIEW_SCHEDULE_STATUSES.includes(
    status as (typeof AI_INTERVIEW_SCHEDULE_STATUSES)[number],
  );
}

export function isInInterviewPipeline(status?: string): boolean {
  return AI_INTERVIEW_PIPELINE_STATUSES.includes(
    status as (typeof AI_INTERVIEW_PIPELINE_STATUSES)[number],
  );
}

export function canProceedToInterview(app: {
  status: string;
  jdScore?: number;
  interview?: { status?: string } | null;
}): boolean {
  if (app.status === "rejected") return false;
  return isShortlistedForInterview(app.status) || isInInterviewPipeline(app.status);
}

export function isScreeningOnlyRejection(
  status?: string,
  _jdScore?: number | null,
  _interview?: { status?: string } | null,
): boolean {
  return status === "rejected";
}

/** @deprecated use isInterviewBelowThreshold */
export function isInterviewRejected(
  recommendation?: string | null,
  finalScore?: number | null,
): boolean {
  return isInterviewBelowThreshold(recommendation, finalScore);
}
