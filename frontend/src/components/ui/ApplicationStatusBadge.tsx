import { formatApplicationStatus, isApplicationRejected } from "@/lib/applicationStatus";

interface Props {
  status: string;
  interview?: { status?: string; recommendation?: string; finalScore?: number } | null;
  size?: "xs" | "sm";
  className?: string;
}

export default function ApplicationStatusBadge({
  status,
  interview,
  size = "sm",
  className = "",
}: Props) {
  const rejected = isApplicationRejected(status, interview);
  const label = rejected ? "Rejected" : formatApplicationStatus(status);
  const sizeClass = size === "xs" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";

  if (rejected) {
    return (
      <span
        className={`inline-flex items-center font-semibold rounded-full bg-red-100 text-red-700 border border-red-200 capitalize ${sizeClass} ${className}`}
      >
        {label}
      </span>
    );
  }

  const positive = ["shortlisted", "interview_completed", "human_interview_scheduled", "human_interview_completed", "hired", "offer_pending"].includes(status);
  const negative = ["offer_declined"].includes(status);
  const pending = ["applied", "interview_scheduled", "interview_submitted"].includes(status);

  const tone = positive
    ? "bg-green-100 text-green-800 border-green-200"
    : negative
      ? "bg-red-50 text-red-700 border-red-200"
      : pending
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-cream text-body border-aqua/20";

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border capitalize ${sizeClass} ${tone} ${className}`}
    >
      {label}
    </span>
  );
}
