import { XCircle } from "lucide-react";
import {
  REJECTED_CANDIDATE_MESSAGE,
  REJECTED_RECRUITER_MESSAGE,
  REJECTED_SCREENING_CANDIDATE_MESSAGE,
  REJECTED_SCREENING_RECRUITER_MESSAGE,
} from "@/lib/applicationStatus";

interface Props {
  audience: "candidate" | "recruiter";
  reason?: "screening" | "interview";
  className?: string;
}

export default function RejectedNotice({ audience, reason = "interview", className = "" }: Props) {
  const message = reason === "screening"
    ? (audience === "candidate" ? REJECTED_SCREENING_CANDIDATE_MESSAGE : REJECTED_SCREENING_RECRUITER_MESSAGE)
    : (audience === "candidate" ? REJECTED_CANDIDATE_MESSAGE : REJECTED_RECRUITER_MESSAGE);

  return (
    <div className={`flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 ${className}`}>
      <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">Rejected</p>
        <p className="text-xs text-red-600 mt-0.5">{message}</p>
      </div>
    </div>
  );
}
