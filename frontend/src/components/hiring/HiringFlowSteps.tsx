interface Props {
  steps: string[];
  className?: string;
}

export default function HiringFlowSteps({ steps, className = "" }: Props) {
  return (
    <div className={`grid grid-cols-1 xs:grid-cols-2 lg:flex lg:flex-wrap gap-2 text-xs text-body min-w-0 ${className}`}>
      {steps.map((step, i) => (
        <span key={step} className="flex items-start sm:items-center gap-1.5 min-w-0">
          <span className="w-5 h-5 shrink-0 rounded-full bg-aqua/20 text-accent flex items-center justify-center font-bold">
            {i + 1}
          </span>
          <span className="min-w-0 break-words leading-snug">{step}</span>
          {i < steps.length - 1 && <span className="hidden lg:inline text-muted shrink-0">→</span>}
        </span>
      ))}
    </div>
  );
}

export const RECRUITER_FLOW_STEPS = [
  "KB agent creates JD",
  "Candidate applies",
  "AI screens resume vs JD",
  "Auto-shortlist or HR shortlist",
  "Schedule AI interview",
  "HR Pass/Reject after AI",
  "Schedule human panel + briefing",
  "Mark panel complete",
  "Send offer or reject",
];

export const CANDIDATE_APPLY_STEPS = [
  "Browse job",
  "Upload resume",
  "AI JD screening",
  "HR screening",
  "AI interview",
  "Human round",
  "Final decision",
];

export const RECRUITER_DASHBOARD_FLOW = [
  "Candidate applies + resume",
  "AI JD screening",
  "HR screening",
  "Schedule interview",
];
