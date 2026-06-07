import { isShortlistedForInterview } from "@/lib/applicationStatus";

export function getInterviewDeadline(interview: Record<string, unknown>): Date | null {
  const raw = interview.deadlineAt || interview.deadline_at || interview.scheduledAt || interview.scheduled_at;
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isInterviewExpired(interview: Record<string, unknown>): boolean {
  if (interview.is_expired === true || interview.status === "expired") return true;
  const deadline = getInterviewDeadline(interview);
  if (!deadline) return false;
  return interview.status === "scheduled" && Date.now() > deadline.getTime();
}

export function interviewAttemptUsed(interview: Record<string, unknown>): boolean {
  if (interview.attempt_used === true) return true;
  return ["completed", "analyzing", "failed"].includes(String(interview.status));
}

export function canStartInterview(interview: Record<string, unknown>): boolean {
  if (interview.can_start === false) return false;
  if (interviewAttemptUsed(interview)) return false;
  if (isInterviewExpired(interview)) return false;
  return interview.status === "scheduled" || interview.status === "in_progress";
}

export function canScheduleInterviewForApplication(
  interview: Record<string, unknown> | null | undefined,
  application?: { status?: string; jdScore?: number } | null,
): boolean {
  if (application) {
    if (application.status === "rejected") return false;
    if (application.status === "interview_scheduled") return false;
    if (!isShortlistedForInterview(application.status)) return false;
  }
  if (!interview) return true;
  if (["completed", "analyzing", "in_progress", "failed"].includes(String(interview.status))) {
    return false;
  }
  if (interview.status === "scheduled" && !isInterviewExpired(interview)) return false;
  return true;
}

export function formatDeadline(interview: Record<string, unknown>): string {
  const d = getInterviewDeadline(interview);
  return d ? d.toLocaleString() : "No deadline set";
}

export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Deadline passed";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Earliest allowed deadline (30 min from now) */
export function minDeadlineLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  return toDatetimeLocal(d);
}

/** Default deadline: 3 days from now, for datetime-local input */
export function defaultDeadlineLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(17, 0, 0, 0);
  return toDatetimeLocal(d);
}

export function localDatetimeToIso(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

const STATUS_PRIORITY: Record<string, number> = {
  scheduled: 50,
  analyzing: 40,
  completed: 30,
  expired: 20,
  failed: 10,
};

function interviewRoleKey(item: Record<string, unknown>): string {
  const candidateId = item.candidateId ?? item.candidate_id;
  const jobId = item.jobId ?? item.job_id;
  if (candidateId != null && jobId != null) {
    return `${candidateId}-${jobId}`;
  }
  return `id-${item.id}`;
}

function interviewPriority(item: Record<string, unknown>): number {
  if (item.status === "scheduled" && isInterviewExpired(item)) {
    return STATUS_PRIORITY.expired;
  }
  if (canStartInterview(item)) {
    return STATUS_PRIORITY.scheduled + 5;
  }
  return STATUS_PRIORITY[String(item.status)] || 0;
}

export function hasBlockingInterviewForRole(
  items: Record<string, unknown>[],
  candidateId: number,
  jobId: number,
): boolean {
  return items.some((i) => {
    const cid = Number(i.candidateId ?? i.candidate_id);
    const jid = Number(i.jobId ?? i.job_id);
    if (cid !== candidateId || jid !== jobId) return false;
    if (["completed", "analyzing", "in_progress", "failed"].includes(String(i.status))) return true;
    return i.status === "scheduled" && !isInterviewExpired(i);
  });
}

/** One interview per candidate + job (role) — keeps the most relevant record */
export function dedupeInterviewsByRole(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const key = interviewRoleKey(item);
    const existing = byKey.get(key);
    const pri = interviewPriority(item);
    const existingPri = existing ? interviewPriority(existing) : -1;
    if (!existing || pri > existingPri
      || (pri === existingPri && Number(item.id || 0) > Number(existing.id || 0))) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const da = getInterviewDeadline(a)?.getTime() ?? 0;
    const db = getInterviewDeadline(b)?.getTime() ?? 0;
    return db - da;
  });
}
