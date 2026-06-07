"use client";

import RichTextContent from "@/components/ui/RichTextContent";

interface DimensionScore {
  score?: number;
  max?: number;
  notes?: string;
  match_pct?: number;
}

interface Props {
  screening?: {
    verdict?: string;
    recommendation?: string;
    total_score?: number;
    ai_score?: number;
    max_score?: number;
    candidate_type?: string;
    procedure?: string;
    escalate_to_human?: boolean;
    red_flags?: string[];
    top_strengths?: string[];
    key_gaps?: string[];
    decision_note?: string;
    dimension_scores?: Record<string, DimensionScore>;
    screening_result?: { dimension_scores?: Record<string, DimensionScore> };
  } | null;
  jdScore?: number;
  className?: string;
}

function verdictStyle(verdict: string): string {
  const v = verdict.toLowerCase();
  if (v.includes("priority") || v.includes("strong fit")) {
    return "bg-green-100 text-green-800 border-green-200";
  }
  if (v.includes("shortlisted") || v.includes("good fit")) {
    return "bg-aqua/15 text-accent border-aqua/30";
  }
  if (v.includes("flagged")) {
    return "bg-amber-100 text-amber-900 border-amber-200";
  }
  if (v.includes("not shortlisted") || v.includes("not eligible")) {
    return "bg-gray-100 text-gray-700 border-gray-200";
  }
  return "bg-cream text-body border-aqua/10";
}

export default function ScreeningResultCard({ screening, jdScore, className = "" }: Props) {
  if (!screening && jdScore == null) return null;

  const verdict = screening?.verdict || screening?.recommendation || "Awaiting review";
  const score = Math.round(screening?.total_score ?? screening?.ai_score ?? jdScore ?? 0);
  const maxScore = screening?.max_score ?? 100;
  const dims = screening?.dimension_scores || screening?.screening_result?.dimension_scores || {};
  const dimEntries = Object.entries(dims);

  return (
    <div className={`p-4 rounded-xl border border-aqua/20 bg-cream/30 space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-label">Resume screening (harness SOP)</p>
        {screening?.candidate_type && (
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/60 text-muted">
            {screening.candidate_type}
          </span>
        )}
        {screening?.procedure && (
          <span className="text-[10px] text-muted">{screening.procedure.replace(/_/g, " ")}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl font-bold text-heading">{score}<span className="text-sm text-muted">/{maxScore}</span></span>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${verdictStyle(verdict)}`}>
          {verdict}
        </span>
        {screening?.escalate_to_human && (
          <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            HR screening required
          </span>
        )}
      </div>

      {screening?.decision_note && (
        <RichTextContent content={screening.decision_note} variant="on-light" className="text-sm" />
      )}

      {dimEntries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {dimEntries.map(([key, val]) => (
            <div key={key} className="bg-white/50 rounded-lg px-3 py-2 text-xs">
              <p className="font-semibold text-label capitalize">{key.replace(/_/g, " ")}</p>
              <p className="text-heading font-bold">{val.score ?? "—"}/{val.max ?? "—"}</p>
              {val.match_pct != null && <p className="text-muted">Match {Math.round(val.match_pct)}%</p>}
            </div>
          ))}
        </div>
      )}

      {(screening?.top_strengths?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-label mb-1">Top strengths</p>
          <ul className="text-xs text-body list-disc list-inside">
            {screening!.top_strengths!.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}

      {(screening?.key_gaps?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-label mb-1">Key gaps</p>
          <ul className="text-xs text-muted list-disc list-inside">
            {screening!.key_gaps!.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
      )}

      {(screening?.red_flags?.length ?? 0) > 0 && (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="font-semibold mb-1">Red flags</p>
          <ul className="list-disc list-inside">
            {screening!.red_flags!.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-muted">Like great-harness-agent — scores are advisory; HR approves or rejects manually.</p>
    </div>
  );
}
