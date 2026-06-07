import { canProceedToInterview, isInterviewPassed } from "@/lib/applicationStatus";

interface InterviewSummary {
  status: string;
  recommendation?: string;
  finalScore?: number;
}

export interface AppForMessage {
  candidateName: string;
  jobTitle: string;
  status: string;
  jdScore?: number;
  interview?: InterviewSummary | null;
}

export interface MessageTemplate {
  id: string;
  label: string;
  text: string;
  suggestedStatus?: string;
}

export function interviewCompleted(app: AppForMessage): boolean {
  if (!canProceedToInterview(app)) return false;
  return app.interview?.status === "completed";
}

/** @deprecated use interviewCompleted — HR decides pass/fail, not score threshold */
export function interviewPassed(app: AppForMessage): boolean {
  return interviewCompleted(app);
}

export function getRecruiterMessageTemplates(app: AppForMessage): MessageTemplate[] {
  const firstName = (app.candidateName || "there").split(" ")[0];
  const role = app.jobTitle || "the role";
  const score = Math.round(app.interview?.finalScore || 0);
  const rec = app.interview?.recommendation || "";

  if (rec === "Strong Hire") {
    return [
      {
        id: "strong_next_round",
        label: "Invite to next round",
        suggestedStatus: "shortlisted",
        text: `Hi ${firstName}, congratulations on your excellent AI interview (${score}%) for ${role}. We would like to move you forward to the next round. Our team will share scheduling details shortly.`,
      },
      {
        id: "strong_panel",
        label: "Panel interview",
        suggestedStatus: "shortlisted",
        text: `Hi ${firstName}, great work on the AI interview for ${role} — your score of ${score}% was outstanding. We would like to schedule a panel interview with the hiring team. Please watch for a follow-up with available times.`,
      },
    ];
  }

  if (rec === "Consider") {
    return [
      {
        id: "consider_review",
        label: "Positive review",
        suggestedStatus: "shortlisted",
        text: `Hi ${firstName}, thank you for completing the AI interview for ${role}. Your score of ${score}% shows strong potential and we are advancing your application to the next stage. We will be in touch soon with next steps.`,
      },
      {
        id: "consider_followup",
        label: "Schedule follow-up",
        suggestedStatus: "shortlisted",
        text: `Hi ${firstName}, you did well in the AI interview for ${role} (${score}%). We would like to schedule a short follow-up conversation with a recruiter. Please reply with your availability this week.`,
      },
    ];
  }

  return [
    {
      id: "improve_encourage",
      label: "Encourage + review",
      suggestedStatus: "interview_completed",
      text: `Hi ${firstName}, thank you for completing the AI interview for ${role}. You scored ${score}% and demonstrated areas of strength. Our team is still reviewing your profile and will update you on next steps shortly.`,
    },
    {
      id: "improve_shortlist",
      label: "Shortlist with feedback",
      suggestedStatus: "shortlisted",
      text: `Hi ${firstName}, we reviewed your AI interview for ${role} (${score}%). While there is room to grow in some areas, we see potential and would like to keep your application under active consideration. A recruiter will reach out with feedback and next steps.`,
    },
  ];
}
