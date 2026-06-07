import { isScreeningRejected, SCREENING_PASS_THRESHOLD } from "@/lib/applicationStatus";



/** 12-step pipeline — harness flow with HR checkpoints + panel completion gate. */

export const FULL_HIRING_PIPELINE = [

  { id: 1, label: "KB Analysis", short: "Agent 1 reads org knowledge base → tech stack profile", page: "/dashboard/jobs", anchor: "pipeline-step-1" },

  { id: 2, label: "JD Draft", short: "Groq maps skills + drafts job description (saved as draft)", page: "/dashboard/jobs", anchor: "pipeline-step-2" },

  { id: 3, label: "Approve & Post", short: "HR reviews draft → Approve & Post to Job Openings", page: "/dashboard/jobs", anchor: "pipeline-step-3" },

  { id: 4, label: "Apply", short: "Candidate uploads resume + cover note", page: "/dashboard/job-openings", anchor: "apply" },

  { id: 5, label: "Resume Screen", short: "Groq harness SOP scores resume vs JD", page: "/dashboard/applications", anchor: "pipeline-step-5" },

  { id: 6, label: "HR Screening", short: "Auto-shortlist ≥80% or HR shortlists manually", page: "/dashboard/applications", anchor: "pipeline-step-6" },

  { id: 7, label: "Schedule AI Interview", short: "15 tailored Groq questions + invite email", page: "/dashboard/applications", anchor: "pipeline-step-7" },

  { id: 8, label: "AI Interview", short: "30 min voice session → Groq eval", page: "/dashboard/interviews", anchor: "pipeline-step-8" },

  { id: 9, label: "HR AI Review", short: "Pass or Reject after scores — Checkpoint 3", page: "/dashboard/applications", anchor: "pipeline-step-9" },

  { id: 10, label: "Human Panel", short: "Meet + briefing emails to panel", page: "/dashboard/applications", anchor: "pipeline-step-10" },

  { id: 11, label: "Panel Complete", short: "HR marks human round done", page: "/dashboard/applications", anchor: "pipeline-step-11" },

  { id: 12, label: "Final Decision", short: "Offer or reject + email candidate", page: "/dashboard/applications", anchor: "pipeline-step-12" },

] as const;

/** Candidate-facing routes for pipeline steps (recruiter-only pages map to job-openings). */
const CANDIDATE_PIPELINE_TARGETS: Record<number, { page: string; anchor: string }> = {
  1: { page: "/dashboard/job-openings", anchor: "browse-jobs" },
  2: { page: "/dashboard/job-openings", anchor: "browse-jobs" },
  3: { page: "/dashboard/job-openings", anchor: "browse-jobs" },
  4: { page: "/dashboard/job-openings", anchor: "apply" },
  5: { page: "/dashboard/job-openings", anchor: "progress" },
  6: { page: "/dashboard/job-openings", anchor: "progress" },
  7: { page: "/dashboard/job-openings", anchor: "progress" },
  8: { page: "/dashboard/interviews", anchor: "pipeline-step-8" },
  9: { page: "/dashboard/job-openings", anchor: "progress" },
  10: { page: "/dashboard/job-openings", anchor: "human-panel" },
  11: { page: "/dashboard/job-openings", anchor: "progress" },
  12: { page: "/dashboard/job-openings", anchor: "offer" },
};

export function getPipelineStepHref(stepId: number, options?: { candidate?: boolean }): string {
  if (options?.candidate) {
    const target = CANDIDATE_PIPELINE_TARGETS[stepId];
    if (target) return `${target.page}#${target.anchor}`;
  }
  const step = FULL_HIRING_PIPELINE.find((s) => s.id === stepId);
  if (!step) return "/dashboard";
  return `${step.page}#${step.anchor}`;
}

export function parsePipelineStepFromHash(hash: string): number | null {
  const id = hash.replace(/^#/, "");
  if (id.startsWith("pipeline-step-")) {
    const n = parseInt(id.replace("pipeline-step-", ""), 10);
    return Number.isFinite(n) ? n : null;
  }
  const byAnchor = FULL_HIRING_PIPELINE.find((s) => s.anchor === id);
  return byAnchor?.id ?? null;
}



export interface HumanInterview {

  interviewDate?: string;

  interviewTime?: string;

  meetLink?: string;

  interviewers?: { name: string; email: string; role?: string }[];

  notes?: string;

  status?: string;

  panelNotes?: string;

  completedAt?: string;

  completedByName?: string;

}



export interface FinalDecision {

  decision?: "selected" | "rejected";

  salary?: string;

  startDate?: string;

  message?: string;

  offerResponse?: "pending" | "accepted" | "rejected";

  offerRespondedAt?: string;

  candidateNote?: string;

  offerLetterHtml?: string;

  offerLetterSubject?: string;

}



export interface AiInterviewReview {

  decision?: "pending" | "qualified" | "rejected";

  note?: string;

  reviewedByName?: string;

  reviewedAt?: string;

}



export interface PipelineApplication {

  id: number;

  status: string;

  jdScore?: number;

  autoShortlisted?: boolean;

  interview?: {

    status: string;

    finalScore?: number;

    compositeScore?: number;

    interviewScore?: number;

    screeningScore?: number;

    shortlistVerdict?: string;

    recommendation?: string;

    verdict?: string;

  } | null;

  aiInterviewReview?: AiInterviewReview | null;

  humanInterview?: HumanInterview | null;

  finalDecision?: FinalDecision | null;

}



export function getPipelineStep(app: PipelineApplication | null): number {

  if (!app) return 1;

  if (app.finalDecision?.decision) return 12;

  if (app.humanInterview?.status === "completed") return 12;

  if (app.humanInterview?.status === "scheduled") return 11;

  if (app.aiInterviewReview?.decision === "qualified") return 10;

  if (app.interview?.status === "completed") return 9;

  if (["scheduled", "in_progress", "analyzing"].includes(app.interview?.status || "")) return 8;

  if (app.status === "interview_scheduled") return 8;

  if (app.status === "shortlisted") return 7;

  if (app.jdScore != null && app.status !== "rejected") return 6;

  if (app.jdScore != null) return 5;

  return 4;

}



export function canScheduleHumanInterview(app: PipelineApplication | null | undefined): boolean {

  if (!app?.interview || app.interview.status !== "completed") return false;

  if (app.status === "rejected" || app.aiInterviewReview?.decision === "rejected") return false;

  if (app.aiInterviewReview?.decision !== "qualified") return false;

  if (app.humanInterview?.status) return false;

  return true;

}



export function canCompleteHumanPanel(app: PipelineApplication | null | undefined): boolean {

  if (!app?.humanInterview || app.humanInterview.status !== "scheduled") return false;

  if (app.finalDecision?.decision) return false;

  return true;

}



export function canSendFinalDecision(app: PipelineApplication | null | undefined): boolean {

  if (!app?.humanInterview || app.humanInterview.status !== "completed") return false;

  if (app.finalDecision?.decision) return false;

  if (app.aiInterviewReview?.decision !== "qualified") return false;

  return true;

}



export function needsAiInterviewHrReview(app: PipelineApplication | null | undefined): boolean {

  if (!app?.interview || app.interview.status !== "completed") return false;

  if (app.status === "rejected") return false;

  const d = app.aiInterviewReview?.decision;

  return !d || d === "pending";

}



export function isOfferPending(app: PipelineApplication | null | undefined): boolean {

  if (!app) return false;

  return app.status === "offer_pending"

    || (app.finalDecision?.decision === "selected" && app.finalDecision?.offerResponse === "pending");

}



export function pipelineStatusLabel(app: PipelineApplication | null | undefined): string {

  if (!app) return "Applied";

  if (app.status === "hired" || app.finalDecision?.offerResponse === "accepted") return "Hired — offer accepted";

  if (app.status === "offer_declined" || app.finalDecision?.offerResponse === "rejected") return "Offer declined";

  if (isOfferPending(app)) return "Offer pending — accept or decline in portal";

  if (app.finalDecision?.decision === "rejected") return "Final rejection";

  if (app.humanInterview?.status === "completed") return "Human panel complete — send offer or rejection";

  if (app.humanInterview?.status === "scheduled") return "Human panel scheduled — mark complete after round";

  if (app.status === "rejected" || app.aiInterviewReview?.decision === "rejected") return "Rejected by HR";

  if (app.aiInterviewReview?.decision === "qualified") {

    const composite = app.interview?.compositeScore ?? app.interview?.finalScore;

    return `Passed HR review (composite ${Math.round(composite || 0)}%) — schedule human panel`;

  }

  if (app.interview?.status === "completed") {

    const composite = app.interview?.compositeScore ?? app.interview?.finalScore;

    const verdict = app.interview?.shortlistVerdict || app.interview?.verdict;

    return `AI interview done — composite ${Math.round(composite || 0)}%${verdict ? ` (${verdict})` : ""} — Pass or Reject required`;

  }

  if (app.status === "shortlisted") {

    return app.autoShortlisted

      ? `Auto-shortlisted (${Math.round(app.jdScore || 0)}%) — schedule AI interview`

      : "Shortlisted — schedule AI interview";

  }

  if (app.interview?.status === "analyzing") return "AI analyzing…";

  if (["scheduled", "in_progress"].includes(app.interview?.status || "")) return "AI interview pending";

  if (app.status === "rejected") return "Rejected at HR screening";

  if (app.jdScore != null && isScreeningRejected(app.jdScore)) {

    return `Screened ${Math.round(app.jdScore)}% (below ${SCREENING_PASS_THRESHOLD}% guideline) — HR decides`;

  }

  if (app.jdScore != null) return `Screened ${Math.round(app.jdScore)}% — awaiting HR shortlist`;

  return "Applied — awaiting screening";

}


