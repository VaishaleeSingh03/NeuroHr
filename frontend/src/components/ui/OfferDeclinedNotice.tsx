import { ThumbsDown } from "lucide-react";

interface Props {
  audience: "candidate" | "recruiter";
  jobTitle?: string;
  className?: string;
}

export default function OfferDeclinedNotice({ audience, jobTitle, className = "" }: Props) {
  const role = jobTitle ? ` for ${jobTitle}` : "";
  const message = audience === "candidate"
    ? `You declined this offer${role}. Your application is closed for this role — you may apply for other openings anytime.`
    : `The candidate declined the offer${role}. Consider reopening the role or contacting backup candidates.`;

  return (
    <div className={`flex items-start gap-2 text-sm text-body bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 ${className}`}>
      <ThumbsDown className="w-5 h-5 flex-shrink-0 mt-0.5 text-muted" />
      <div>
        <p className="font-semibold text-heading">Offer declined</p>
        <p className="text-xs text-muted mt-0.5">{message}</p>
      </div>
    </div>
  );
}
