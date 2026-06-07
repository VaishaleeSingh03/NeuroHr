import toast from "react-hot-toast";
import { interviewsAPI } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";
import { localDatetimeToIso } from "@/lib/interviewUtils";

export interface ScheduleInterviewInput {
  candidateId: number;
  jobId: number;
  applicationId?: number;
  deadlineLocal: string;
}

export function validateInterviewDeadline(deadlineLocal: string): string | null {
  if (!deadlineLocal) return "Select interview deadline (date & time)";
  const deadlineIso = localDatetimeToIso(deadlineLocal);
  if (new Date(deadlineIso).getTime() <= Date.now()) {
    return "Deadline must be in the future";
  }
  return null;
}

export async function scheduleInterviewWithDeadline(input: ScheduleInterviewInput) {
  const validationError = validateInterviewDeadline(input.deadlineLocal);
  if (validationError) {
    toast.error(validationError);
    throw new Error(validationError);
  }

  const deadlineIso = localDatetimeToIso(input.deadlineLocal);
  try {
    const { data } = await interviewsAPI.schedule({
      candidate_id: input.candidateId,
      job_id: input.jobId,
      scheduled_at: deadlineIso,
      deadline_at: deadlineIso,
      application_id: input.applicationId,
    });
    return { deadlineIso, interview: data };
  } catch (err) {
    toast.error(getApiErrorMessage(err, "Failed to schedule interview"));
    throw err;
  }
}
