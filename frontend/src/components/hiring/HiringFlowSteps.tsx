interface Props {
  steps: string[];
  className?: string;
}

export default function HiringFlowSteps({ steps, className = "" }: Props) {
  return (
    <div className={`flex flex-wrap gap-2 text-xs text-body ${className}`}>
      {steps.map((step, i) => (
        <span key={step} className="flex items-center gap-1">
          <span className="w-5 h-5 rounded-full bg-aqua/20 text-accent flex items-center justify-center font-bold">
            {i + 1}
          </span>
          {step}
          {i < steps.length - 1 && <span className="text-muted">→</span>}
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
