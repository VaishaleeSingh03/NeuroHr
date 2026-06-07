import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { SCREENING_PASS_THRESHOLD } from "@/lib/applicationStatus";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getScoreClass(score: number): string {
  if (score >= SCREENING_PASS_THRESHOLD) return "score-high";
  if (score >= SCREENING_PASS_THRESHOLD - 20) return "score-mid";
  return "score-low";
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Normalize API snake_case / camelCase fields */
export function normalizeCandidate(raw: Record<string, unknown>) {
  const extracted = (raw.extractedData || {}) as Record<string, unknown>;
  const screening = (extracted.screening || {}) as Record<string, unknown>;
  const skillMatch = (raw.skillMatch || screening.skill_match || {}) as Record<string, unknown>;
  const matchedSkills = (skillMatch.matched as string[]) || [];
  return {
    id: raw.id as number,
    name: (raw.name as string) || "Unknown",
    email: (raw.email as string) || "",
    phone: (raw.phone as string) || "",
    ai_score: (raw.ai_score ?? raw.rankingScore ?? raw.matchScore ?? screening.ai_score ?? 0) as number,
    skills: matchedSkills.length ? matchedSkills : ((raw.skills as string[]) || []),
    missing_skills: (raw.missing_skills ?? raw.missingSkills ?? screening.missing_skills ?? []) as string[],
    status: (raw.status as string) || "applied",
    source: (raw.source as string) || "",
    jd_fit_summary: (raw.jd_fit_summary ?? screening.jd_fit_summary ?? "") as string,
    recommendation: (raw.recommendation ?? screening.recommendation ?? "") as string,
    experience: (raw.experience as object[]) || [],
    education: (raw.education as object[]) || [],
  };
}
