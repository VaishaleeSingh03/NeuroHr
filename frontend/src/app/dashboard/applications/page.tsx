"use client";

import { useEffect, useState } from "react";
import { usePipelineHashScroll } from "@/hooks/usePipelineHashScroll";
import { motion } from "framer-motion";
import {
  Users, Calendar, Check, X, Loader2, FileText, Download, ExternalLink, Mail, Send,
  Video, UserCheck, Briefcase, Plus, Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import PageHeader from "@/components/ui/PageHeader";
import RichTextContent from "@/components/ui/RichTextContent";
import ScoreIndicator from "@/components/ui/ScoreIndicator";
import { jobsAPI } from "@/lib/api";
import {
  defaultDeadlineLocal, minDeadlineLocal, canScheduleInterviewForApplication,
} from "@/lib/interviewUtils";
import { scheduleInterviewWithDeadline } from "@/lib/interviewSchedule";
import { getApiErrorMessage } from "@/lib/errors";
import HiringFlowSteps, { RECRUITER_FLOW_STEPS } from "@/components/hiring/HiringFlowSteps";
import HiringPipelineFlow from "@/components/hiring/HiringPipelineFlow";
import {
  getPipelineStep, canScheduleHumanInterview, canCompleteHumanPanel, canSendFinalDecision,
  needsAiInterviewHrReview, pipelineStatusLabel, isOfferDeclined,
  isAwaitingCandidateAiInterview, shouldShowBottomShortlistReject,
  type HumanInterview, type FinalDecision, type AiInterviewReview,
} from "@/lib/hiringPipeline";
import {
  getRecruiterMessageTemplates, type MessageTemplate,
} from "@/lib/applicationMessages";
import Link from "next/link";
import ApplicationStatusBadge from "@/components/ui/ApplicationStatusBadge";
import ScreeningResultCard from "@/components/hiring/ScreeningResultCard";
import RejectedNotice from "@/components/ui/RejectedNotice";
import OfferDeclinedNotice from "@/components/ui/OfferDeclinedNotice";
import RichTextEditor, { getRichHtml, isRichTextEmpty } from "@/components/ui/RichTextEditor";
import { toEditorHtml } from "@/lib/tiptapContent";
import {
  isScreeningRejected, canProceedToInterview, isShortlistedForInterview, SCREENING_PASS_THRESHOLD,
} from "@/lib/applicationStatus";
import { dispatchNotificationsRefresh } from "@/lib/notificationEvents";

interface Application {
  id: number;
  jobId: number;
  candidateId: number;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  phone?: string;
  jdScore?: number;
  jdFitSummary?: string;
  recommendation?: string;
  matchedSkills?: string[];
  missingSkills?: string[];
  skills?: string[];
  coverNote?: string;
  status: string;
  autoShortlisted?: boolean;
  appliedAt: string;
  resumeFileName?: string;
  resumeMimeType?: string;
  hasResume?: boolean;
  parsedData?: {
    experience?: { title?: string; company?: string; duration?: string }[];
    education?: { degree?: string; institution?: string; year?: string }[];
    skills?: string[];
  };
  interview?: {
    id: number;
    status: string;
    finalScore?: number;
    interviewScore?: number;
    compositeScore?: number;
    screeningScore?: number;
    technicalScore?: number;
    communicationScore?: number;
    problemSolvingScore?: number;
    cultureFitScore?: number;
    experienceDepthScore?: number;
    jdAlignmentScore?: number;
    verdict?: string;
    shortlistVerdict?: string;
    recommendation?: string;
    aiFeedback?: string;
    completedAt?: string;
    scheduledAt?: string;
    deadlineAt?: string;
    attemptUsed?: boolean;
  } | null;
  aiInterviewReview?: AiInterviewReview | null;
  humanInterview?: HumanInterview | null;
  finalDecision?: FinalDecision | null;
  screening?: Record<string, unknown> | null;
}

interface PanelInterviewer {
  name: string;
  email: string;
  role: string;
}

const EMPTY_PANEL_INTERVIEWER: PanelInterviewer = { name: "", email: "", role: "" };

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [statusAction, setStatusAction] = useState<"shortlisted" | "rejected" | null>(null);
  const [scheduleAt, setScheduleAt] = useState(defaultDeadlineLocal);
  const [scheduling, setScheduling] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [recruiterMessage, setRecruiterMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [humanDate, setHumanDate] = useState("");
  const [humanTime, setHumanTime] = useState("");
  const [humanDuration, setHumanDuration] = useState(60);
  const [meetLink, setMeetLink] = useState("");
  const [panelInterviewers, setPanelInterviewers] = useState<PanelInterviewer[]>([{ ...EMPTY_PANEL_INTERVIEWER }]);
  const [calendarConfigured, setCalendarConfigured] = useState(false);
  const [useCustomMeetLink, setUseCustomMeetLink] = useState(false);
  const [humanNotes, setHumanNotes] = useState("");
  const [schedulingHuman, setSchedulingHuman] = useState(false);
  const [aiReviewNote, setAiReviewNote] = useState("");
  const [aiReviewAction, setAiReviewAction] = useState<"qualified" | "reject" | null>(null);
  const [finalSalary, setFinalSalary] = useState("");
  const [finalGender, setFinalGender] = useState<"male" | "female" | "other">("other");
  const [finalStartDate, setFinalStartDate] = useState("");
  const [finalMessage, setFinalMessage] = useState("");
  const [finalDecisionAction, setFinalDecisionAction] = useState<"selected" | "rejected" | null>(null);
  const [panelCompleteNotes, setPanelCompleteNotes] = useState("");
  const [completingPanel, setCompletingPanel] = useState(false);

  const load = () => {
    jobsAPI.applicationsInbox().then((r) => setApps(r.data)).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  usePipelineHashScroll();

  useEffect(() => {
    jobsAPI.calendarStatus()
      .then((r) => setCalendarConfigured(Boolean(r.data?.calendar_configured)))
      .catch(() => setCalendarConfigured(false));
  }, []);

  useEffect(() => {
    setRecruiterMessage("");
    setMessageStatus("");
  }, [selected?.id]);

  useEffect(() => {
    if (selected?.interview?.status !== "analyzing") return;
    const poll = setInterval(load, 8000);
    return () => clearInterval(poll);
  }, [selected?.interview?.status]);

  useEffect(() => {
    if (!selected?.id || !selected.hasResume) {
      setResumeUrl(null);
      return;
    }

    let active = true;
    setResumeLoading(true);
    jobsAPI.getApplicationResume(selected.id)
      .then(({ data }) => {
        if (!active) return;
        const url = URL.createObjectURL(data);
        setResumeUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch(() => {
        if (active) setResumeUrl(null);
      })
      .finally(() => {
        if (active) setResumeLoading(false);
      });

    return () => {
      active = false;
      setResumeUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [selected?.id, selected?.hasResume]);

  const downloadResume = () => {
    if (!resumeUrl || !selected) return;
    const a = document.createElement("a");
    a.href = resumeUrl;
    a.download = selected.resumeFileName || "resume.pdf";
    a.click();
  };

  const isPdfResume =
    selected?.resumeMimeType === "application/pdf"
    || (selected?.resumeFileName || "").toLowerCase().endsWith(".pdf");

  const scheduleInterview = async () => {
    if (!selected) return;
    if (!isShortlistedForInterview(selected.status)) {
      toast.error("Shortlist the candidate first, then schedule the AI interview.");
      return;
    }
    setScheduling(true);
    try {
      const { deadlineIso, interview } = await scheduleInterviewWithDeadline({
        candidateId: selected.candidateId,
        jobId: selected.jobId,
        applicationId: selected.id,
        deadlineLocal: scheduleAt,
      });
      toast.success(`Interview scheduled — ${selected.candidateName} must complete before ${new Date(deadlineIso).toLocaleString()}`);
      const refreshed = await jobsAPI.applicationsInbox();
      setApps(refreshed.data);
      const updated = refreshed.data.find((a: Application) => a.id === selected.id);
      const interviewSummary = interview ? {
        id: interview.id,
        status: interview.status || "scheduled",
        finalScore: interview.finalScore,
        scheduledAt: interview.scheduledAt || interview.scheduled_at,
        deadlineAt: interview.deadlineAt || interview.deadline_at,
      } : null;
      setSelected(updated ? {
        ...updated,
        interview: updated.interview || interviewSummary,
      } : {
        ...selected,
        status: "interview_scheduled",
        interview: interviewSummary,
      });
      dispatchNotificationsRefresh();
    } catch {
      /* toast shown in scheduleInterviewWithDeadline */
    } finally {
      setScheduling(false);
    }
  };

  const updateStatus = async (status: string, reason?: "screening" | "interview") => {
    if (!selected) return;
    const prevStatus = selected.status;
    const action = status === "rejected" ? "rejected" : "shortlisted";
    setStatusAction(action);
    setSelected((s) => (s ? { ...s, status } : null));
    try {
      await jobsAPI.updateApplicationStatus(selected.id, status, reason ? { reason } : undefined);
      toast.success(
        status === "rejected"
          ? "Rejected — notification sent; rejection email sending"
          : `Shortlisted — AI interview scheduling unlocked`,
      );
      load();
    } catch {
      toast.error("Update failed");
      setSelected((s) => (s ? { ...s, status: prevStatus } : null));
    } finally {
      setStatusAction(null);
    }
  };

  const applyMessageTemplate = (template: MessageTemplate) => {
    setRecruiterMessage(toEditorHtml(template.text));
    if (template.suggestedStatus) setMessageStatus(template.suggestedStatus);
  };

  const sendCandidateMessage = async () => {
    const messageHtml = getRichHtml(recruiterMessage);
    if (!selected || !messageHtml) {
      toast.error("Write a message for the candidate");
      return;
    }
    setSendingMessage(true);
    try {
      const { data } = await jobsAPI.sendApplicationMessage(selected.id, {
        message: messageHtml,
        ...(messageStatus ? { status: messageStatus } : {}),
      });
      toast.success(`Message sent to ${selected.candidateName}`);
      setRecruiterMessage("");
      setMessageStatus("");
      load();
      setSelected((s) => (s ? { ...s, status: data.status } : null));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to send message"));
    } finally {
      setSendingMessage(false);
    }
  };

  const showMessagePanel = selected
    ? selected.interview?.status === "completed" && selected.status !== "rejected"
    : false;
  const messageTemplates = selected ? getRecruiterMessageTemplates(selected) : [];
  const selectedRejected = selected?.status === "rejected";
  const selectedOfferDeclined = selected ? isOfferDeclined(selected) : false;
  const belowScreeningGuideline = selected ? isScreeningRejected(selected.jdScore) && !selectedRejected : false;
  const belowInterviewGuideline = selected?.interview?.status === "completed"
    && selected.interview.finalScore != null
    && selected.interview.finalScore < SCREENING_PASS_THRESHOLD
    && !selectedRejected;
  const eligibleForInterview = selected ? canProceedToInterview(selected) : false;
  const awaitingShortlist = selected && !selectedRejected && selected.status === "applied";
  const isShortlisted = selected ? isShortlistedForInterview(selected.status) : false;
  const pipelineStep = getPipelineStep(selected);
  const showAiReviewPanel = selected ? needsAiInterviewHrReview(selected) : false;
  const showHumanSchedule = selected ? canScheduleHumanInterview(selected) : false;
  const showMarkPanelComplete = selected ? canCompleteHumanPanel(selected) : false;
  const showFinalDecision = selected ? canSendFinalDecision(selected) : false;
  const awaitingCandidateAiInterview = selected ? isAwaitingCandidateAiInterview(selected) : false;
  const showBottomShortlistReject = selected ? shouldShowBottomShortlistReject(selected) : false;

  useEffect(() => {
    if (showHumanSchedule) {
      setPanelInterviewers([{ ...EMPTY_PANEL_INTERVIEWER }]);
    }
  }, [selected?.id, showHumanSchedule]);

  const addInterviewerRow = () => {
    setPanelInterviewers((rows) => [...rows, { ...EMPTY_PANEL_INTERVIEWER }]);
  };

  const updatePanelInterviewer = (index: number, field: keyof PanelInterviewer, value: string) => {
    setPanelInterviewers((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const removePanelInterviewer = (index: number) => {
    setPanelInterviewers((rows) => rows.filter((_, i) => i !== index));
  };

  const submitAiInterviewDecision = async (decision: "qualified" | "reject") => {
    if (!selected) return;
    setAiReviewAction(decision);
    try {
      const { data } = await jobsAPI.aiInterviewDecision(selected.id, {
        decision,
        note: getRichHtml(aiReviewNote) || undefined,
      });
      toast.success(decision === "qualified" ? "Candidate passed — schedule human panel" : "Candidate rejected");
      setAiReviewNote("");
      setSelected(data);
      load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to record HR decision"));
    } finally {
      setAiReviewAction(null);
    }
  };

  const scheduleHumanInterview = async () => {
    if (!selected || !humanDate || !humanTime) {
      toast.error("Set interview date and time");
      return;
    }
    const interviewers = panelInterviewers
      .map((i) => ({
        name: i.name.trim() || "Interviewer",
        email: i.email.trim().toLowerCase(),
        role: i.role.trim() || "Panel Member",
      }))
      .filter((i) => i.email.includes("@"));
    if (!interviewers.length) {
      toast.error("Add at least one interviewer Gmail address");
      return;
    }
    setSchedulingHuman(true);
    try {
      const { data } = await jobsAPI.scheduleHumanInterview(selected.id, {
        interview_date: humanDate,
        interview_time: humanTime,
        duration_minutes: humanDuration,
        meet_link: useCustomMeetLink ? meetLink : undefined,
        interviewers,
        notes: getRichHtml(humanNotes),
      });
      const linkMsg = data.meet_link ? ` Meet: ${data.meet_link}` : "";
      toast.success(
        (data as { message?: string }).message || `Panel scheduled — emails sending${linkMsg}`,
        { duration: 8000 },
      );
      if (data.meet_link) setMeetLink(data.meet_link);
      setSelected(data);
      load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to schedule human interview"));
    } finally {
      setSchedulingHuman(false);
    }
  };

  const completeHumanPanel = async () => {
    if (!selected) return;
    setCompletingPanel(true);
    try {
      const { data } = await jobsAPI.completeHumanInterview(selected.id, {
        notes: getRichHtml(panelCompleteNotes),
      });
      toast.success((data as { message?: string }).message || "Human panel marked complete");
      setSelected(data as Application);
      setPanelCompleteNotes("");
      load();
      dispatchNotificationsRefresh();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to mark panel complete"));
    } finally {
      setCompletingPanel(false);
    }
  };

  const submitFinalDecision = async (decision: "selected" | "rejected") => {
    if (!selected) return;
    if (decision === "selected" && !finalSalary.trim()) {
      toast.error("Enter salary / offer for this role before sending the offer email");
      return;
    }
    setFinalDecisionAction(decision);
    try {
      const { data } = await jobsAPI.finalDecision(selected.id, {
        decision,
        salary: finalSalary.trim(),
        start_date: finalStartDate,
        gender: finalGender,
        message: getRichHtml(finalMessage),
      });
      const payload = data as Application & {
        email_sent?: boolean;
        email_error?: string | null;
        email_queued?: boolean;
        message?: string;
      };
      if (payload.email_sent === false) {
        toast.error(
          payload.message
          || payload.email_error
          || `Email could not be sent to ${selected.candidateEmail}. Check SMTP/OAuth on the server.`,
          { duration: 8000 },
        );
      } else {
        toast.success(
          payload.message
          || (decision === "selected"
            ? `Offer sent to ${selected.candidateEmail}`
            : `Decision email sent to ${selected.candidateEmail}`),
        );
      }
      setSelected(payload);
      load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to record decision"));
    } finally {
      setFinalDecisionAction(null);
    }
  };

  const actionBusy = Boolean(
    statusAction || scheduling || aiReviewAction || schedulingHuman
    || completingPanel || finalDecisionAction || sendingMessage,
  );

  const pipelineProcessing =
    (pipelineStep === 6 && statusAction !== null)
    || (pipelineStep === 7 && scheduling)
    || (pipelineStep === 9 && aiReviewAction !== null)
    || (pipelineStep === 10 && schedulingHuman)
    || (pipelineStep === 11 && completingPanel)
    || (pipelineStep === 12 && finalDecisionAction !== null);

  return (
    <div className="page-container">
      <PageHeader
        title="Applications Inbox"
        subtitle="Review resume + JD screening — schedule interviews for qualified candidates"
        icon={Users}
      />

      <GlassCard hover={false} className="mb-6">
        <h3 className="font-bold text-heading mb-2 text-sm">End-to-end hiring pipeline</h3>
        <p className="text-xs text-muted mb-4">Agent → screen → AI interview → human round → decision (great-harness-agent flow, NeuroHR UI)</p>
        <HiringFlowSteps steps={RECRUITER_FLOW_STEPS} className="mb-4" />
        {selected && (
          <div className="border-t border-aqua/10 pt-4">
            <p className="text-xs font-semibold text-label mb-2">
              {selected.candidateName} — {pipelineStatusLabel(selected)}
            </p>
            <HiringPipelineFlow currentStep={pipelineStep} linkable processing={pipelineProcessing} />
          </div>
        )}
      </GlassCard>

      <div className="split-layout">
        <GlassCard className="split-layout-side" hover={false}>
          <h3 className="font-bold text-heading mb-3">Applications ({apps.length})</h3>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {apps.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  selected?.id === a.id ? "border-aqua bg-aqua/10" : "border-aqua/10 hover:bg-cream/50"
                }`}
              >
                <p className="font-medium text-heading text-sm">{a.candidateName}</p>
                <p className="text-xs text-muted">{a.jobTitle}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <p className="text-xs text-accent">
                    {a.recommendation || `Score ${Math.round(a.jdScore || 0)}`}
                    {a.interview?.finalScore ? ` · Interview ${Math.round(a.interview.finalScore)}%` : ""}
                  </p>
                  {a.autoShortlisted && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
                      Auto-shortlist
                    </span>
                  )}
                  <ApplicationStatusBadge status={a.status} interview={a.interview} size="xs" />
                </div>
              </button>
            ))}
            {apps.length === 0 && (
              <p className="text-sm text-muted text-center py-8">No applications yet. Candidates apply from Job Openings.</p>
            )}
          </div>
        </GlassCard>

        <div className="split-layout-main">
          {selected ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <GlassCard hover={false}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h2 className="text-xl font-bold text-heading">{selected.candidateName}</h2>
                      <ApplicationStatusBadge status={selected.status} interview={selected.interview} />
                    </div>
                    <p className="text-sm text-muted">{selected.candidateEmail} {selected.phone && `· ${selected.phone}`}</p>
                    <p className="text-sm text-accent font-medium mt-1">{selected.jobTitle}</p>
                  </div>
                  <ScoreIndicator score={selected.jdScore || 0} size="sm" />
                </div>

                {selectedOfferDeclined && (
                  <OfferDeclinedNotice
                    audience="recruiter"
                    jobTitle={selected.jobTitle}
                    className="mb-4"
                  />
                )}

                {selectedRejected && (
                  <RejectedNotice
                    audience="recruiter"
                    reason={selected.interview?.status === "completed" ? "interview" : "screening"}
                    className="mb-4"
                  />
                )}

                <div id="pipeline-step-5" className="scroll-mt-24">
                  <ScreeningResultCard
                    screening={selected.screening as Parameters<typeof ScreeningResultCard>[0]["screening"]}
                    jdScore={selected.jdScore}
                    className="mb-4"
                  />
                </div>

                <div className="mb-4">
                  <p className="text-xs font-semibold text-label mb-2">Skills vs JD</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(selected.matchedSkills || []).map((s) => (
                      <span key={s} className="tag-skill text-xs"><Check className="w-3 h-3" />{s}</span>
                    ))}
                    {(selected.missingSkills || []).slice(0, 5).map((s) => (
                      <span key={s} className="tag-missing text-xs"><X className="w-3 h-3" />{s}</span>
                    ))}
                  </div>
                </div>

                {selected.coverNote && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-label mb-1">Candidate note</p>
                    <RichTextContent content={selected.coverNote} variant="on-light" className="text-sm" />
                  </div>
                )}

                {selected.jdFitSummary && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-label mb-1">AI fit summary</p>
                    <RichTextContent content={selected.jdFitSummary} variant="on-light" className="text-sm" />
                  </div>
                )}

                <div id="pipeline-step-6" className="scroll-mt-24 mb-4 border-t border-aqua/10 pt-4 space-y-3">
                  {awaitingShortlist && (
                    <div className="p-4 rounded-xl border border-aqua/25 bg-aqua/5 space-y-3">
                      <p className="text-sm text-body">
                        Review screening above, then <strong>Shortlist</strong> to unlock AI interview scheduling.
                      </p>
                      <button
                        onClick={() => updateStatus("shortlisted")}
                        disabled={statusAction !== null || actionBusy}
                        className="btn-primary text-sm flex items-center gap-1.5"
                      >
                        {statusAction === "shortlisted" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Shortlist & enable AI interview
                      </button>
                    </div>
                  )}

                  {isShortlisted && selected.autoShortlisted && (
                    <p className="text-xs text-accent bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      Auto-shortlisted — Groq screening score {Math.round(selected.jdScore || 0)}/100 (≥{SCREENING_PASS_THRESHOLD}%). Schedule AI interview below.
                    </p>
                  )}
                </div>

                <div className="mb-4 border border-aqua/15 rounded-xl overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-cream/60 border-b border-aqua/10">
                    <p className="text-sm font-semibold text-heading flex items-center gap-2">
                      <FileText className="w-4 h-4 text-accent" />
                      {selected.resumeFileName || "Uploaded resume"}
                    </p>
                    {selected.hasResume && resumeUrl && (
                      <div className="flex gap-2">
                        <button type="button" onClick={downloadResume} className="btn-secondary text-xs flex items-center gap-1">
                          <Download className="w-3 h-3" /> Download
                        </button>
                        {isPdfResume && (
                          <a href={resumeUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> Open
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {resumeLoading && (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading resume...
                    </div>
                  )}

                  {!resumeLoading && selected.hasResume && resumeUrl && isPdfResume && (
                    <iframe
                      src={resumeUrl}
                      title="Candidate resume"
                      className="w-full h-[420px] bg-white"
                    />
                  )}

                  {!resumeLoading && selected.hasResume && resumeUrl && !isPdfResume && (
                    <p className="text-sm text-body p-4">
                      DOCX resume saved in database — use Download to view the file.
                    </p>
                  )}

                  {!resumeLoading && !selected.hasResume && (
                    <p className="text-sm text-muted p-4">No resume file on this application.</p>
                  )}
                </div>

                {selected.parsedData && (
                  <div className="mb-4 text-sm space-y-3">
                    {(selected.parsedData.experience?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-label mb-1">Experience (parsed)</p>
                        {selected.parsedData.experience!.slice(0, 4).map((exp, i) => (
                          <p key={i} className="text-body">
                            {exp.title}{exp.company ? ` · ${exp.company}` : ""}{exp.duration ? ` (${exp.duration})` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                    {(selected.parsedData.education?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-label mb-1">Education (parsed)</p>
                        {selected.parsedData.education!.slice(0, 3).map((edu, i) => (
                          <p key={i} className="text-body">
                            {edu.degree}{edu.institution ? ` · ${edu.institution}` : ""}{edu.year ? ` (${edu.year})` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {belowInterviewGuideline && !selectedRejected && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                    AI score {Math.round(selected.interview?.finalScore || 0)}% is below the {SCREENING_PASS_THRESHOLD}% guideline — HR decides next step (message, human round, or reject).
                  </p>
                )}

                {selected.interview && (
                  <div id="pipeline-step-8" className={`scroll-mt-24 mb-4 p-4 rounded-xl border ${selectedRejected ? "border-red-200 bg-red-50/40" : "border-aqua/20 bg-aqua/5"}`}>
                    <p className="text-xs font-semibold text-label mb-2">AI Interview</p>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <p className="text-sm text-body capitalize">
                        Status: <span className="font-medium text-heading">{selected.interview.status.replace(/_/g, " ")}</span>
                      </p>
                      {selectedRejected && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                          Rejected
                        </span>
                      )}
                    </div>
                    {selected.interview.status === "scheduled" && (
                      <p className="text-sm text-body mb-2">
                        Deadline:{" "}
                        <strong>
                          {selected.interview.deadlineAt
                            ? new Date(selected.interview.deadlineAt).toLocaleString()
                            : "set by recruiter"}
                        </strong>
                        {" — "}
                        <Link href="/dashboard/interviews" className="text-accent hover:underline">
                          candidate joins from My Interview
                        </Link>
                      </p>
                    )}
                    {selected.interview.status === "analyzing" && (
                      <p className="text-sm text-muted mb-2 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Candidate submitted — AI analysis in progress…
                      </p>
                    )}
                    {(selected.interview.finalScore != null && selected.interview.finalScore > 0) && (
                      <div className="flex flex-wrap items-center gap-4 mb-3">
                        <ScoreIndicator
                          score={selected.interview.compositeScore ?? selected.interview.finalScore}
                          label="Composite"
                          size="sm"
                        />
                        {selected.interview.verdict && (
                          <span className={`text-sm font-semibold ${selectedRejected ? "text-red-700" : "text-heading"}`}>
                            {selected.interview.verdict}
                          </span>
                        )}
                        {selected.interview.shortlistVerdict && (
                          <span className="text-sm font-semibold text-accent">
                            {selected.interview.shortlistVerdict}
                          </span>
                        )}
                        {selected.interview.interviewScore != null && selected.interview.screeningScore != null && (
                          <span className="text-xs text-muted">
                            80% screening {Math.round(selected.interview.screeningScore)}% + 20% interview {Math.round(selected.interview.interviewScore)}%
                          </span>
                        )}
                      </div>
                    )}
                    {selected.interview.aiFeedback && (
                      <div className="mb-3">
                        <RichTextContent content={selected.interview.aiFeedback} variant="on-light" className="text-sm" maxHeight="120px" />
                      </div>
                    )}
                    <Link
                      href="/dashboard/interviews"
                      className="text-sm text-accent hover:text-aqua-dark font-medium"
                    >
                      View full interview details →
                    </Link>
                  </div>
                )}

                <div id="pipeline-step-7" className="scroll-mt-24 border-t border-aqua/10 pt-4 space-y-3">
                  {!awaitingCandidateAiInterview && (
                  <p className="text-xs font-semibold text-label flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Schedule AI interview (after shortlist)
                  </p>
                  )}

                  {isShortlisted && !canScheduleInterviewForApplication(selected.interview, selected) && !selected.interview && (
                    <p className="text-xs text-accent bg-aqua/10 border border-aqua/20 rounded-lg px-3 py-2">
                      Shortlisted — set a deadline below to schedule the AI voice interview.
                    </p>
                  )}

                  {eligibleForInterview && canScheduleInterviewForApplication(selected.interview, selected) && (
                    <>
                      <label className="text-xs text-label block">Interview deadline (candidate must complete before)</label>
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        min={minDeadlineLocal()}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="input-field mb-2"
                      />
                      <p className="text-xs text-muted mb-2">Candidate can join anytime before this date & time.</p>
                      <button
                        onClick={scheduleInterview}
                        disabled={scheduling || !scheduleAt || actionBusy}
                        className="btn-primary flex items-center gap-2"
                      >
                        {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                        Schedule with deadline
                      </button>
                    </>
                  )}

                  {belowScreeningGuideline && isShortlisted && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Score {Math.round(selected.jdScore || 0)}/100 is below the {SCREENING_PASS_THRESHOLD} guideline — you shortlisted manually; proceed or reject.
                    </p>
                  )}

                  {selectedRejected && (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      Application rejected by HR — interview scheduling is not available.
                    </p>
                  )}

                  {(selected.status === "interview_scheduled" || selected.interview) &&
                    !canScheduleInterviewForApplication(selected.interview, selected) &&
                    !selected.interview?.status?.match(/completed|analyzing/) && (
                    <div className="p-3 rounded-xl border border-aqua/25 bg-aqua/5 space-y-1">
                      <p className="text-xs font-semibold text-accent">AI interview scheduled</p>
                      <p className="text-xs text-body">
                        Candidate can join from <Link href="/dashboard/interviews" className="text-accent underline">My Interview</Link>
                        {selected.interview?.deadlineAt
                          ? ` before ${new Date(selected.interview.deadlineAt).toLocaleString()}`
                          : scheduleAt
                            ? ` before ${new Date(scheduleAt).toLocaleString()}`
                            : ""}.
                      </p>
                    </div>
                  )}

                  {selected.interview && ["completed", "analyzing"].includes(selected.interview.status) && (
                    <p className="text-xs text-muted bg-cream/50 rounded-lg px-3 py-2">
                      {selected.interview.status === "completed"
                        ? "Interview completed — one attempt per candidate per role. Results are above."
                        : "Interview submitted — waiting for AI scores."}
                    </p>
                  )}

                  {showAiReviewPanel && (
                    <div id="pipeline-step-9" className="scroll-mt-24 p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-3">
                      <p className="text-xs font-semibold text-label flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" /> Step 9 — HR review after AI interview
                      </p>
                      <p className="text-xs text-muted">
                        Review AI scores above, then <strong>Pass</strong> to unlock human panel scheduling or <strong>Reject</strong> to close the application.
                      </p>
                      <RichTextEditor
                        value={aiReviewNote}
                        onChange={setAiReviewNote}
                        placeholder="Optional note to candidate (used on reject)…"
                        minHeight="72px"
                        variant="minimal"
                        className="text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => submitAiInterviewDecision("qualified")}
                          disabled={aiReviewAction !== null || actionBusy}
                          className="btn-primary text-xs flex items-center gap-1.5"
                        >
                          {aiReviewAction === "qualified" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Pass — enable human round
                        </button>
                        <button
                          onClick={() => submitAiInterviewDecision("reject")}
                          disabled={aiReviewAction !== null || actionBusy}
                          className="btn-secondary text-xs text-red-600 flex items-center gap-1.5"
                        >
                          {aiReviewAction === "reject" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {selected.aiInterviewReview?.decision === "qualified" && !selected.humanInterview?.status && (
                    <p className="text-xs text-accent bg-aqua/10 border border-aqua/20 rounded-lg px-3 py-2">
                      Passed HR review{selected.aiInterviewReview.reviewedByName ? ` by ${selected.aiInterviewReview.reviewedByName}` : ""} — schedule the human panel below.
                    </p>
                  )}

                  {showMessagePanel && (
                    <div className="p-4 rounded-xl border border-green-200 bg-green-50/50 space-y-3">
                      <p className="text-xs font-semibold text-label flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" /> Message candidate (after AI interview)
                      </p>
                      <p className="text-xs text-muted">
                        Send a tailored follow-up based on their {selected.interview?.recommendation || "interview"} result.
                        The candidate receives this in their notifications.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {messageTemplates.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => applyMessageTemplate(t)}
                            className="btn-secondary text-xs"
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <RichTextEditor
                        value={recruiterMessage}
                        onChange={setRecruiterMessage}
                        placeholder="Write your message to the candidate..."
                        minHeight="120px"
                        variant="full"
                        className="text-sm"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="text-xs text-label flex items-center gap-2">
                          Update status:
                          <select
                            value={messageStatus}
                            onChange={(e) => setMessageStatus(e.target.value)}
                            className="input-field text-xs py-1.5 w-auto"
                          >
                            <option value="">Keep current ({selected.status.replace(/_/g, " ")})</option>
                            <option value="shortlisted">Shortlisted</option>
                            <option value="interview_completed">Interview completed</option>
                            <option value="offer_pending">Offer pending</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={sendCandidateMessage}
                          disabled={sendingMessage || isRichTextEmpty(recruiterMessage)}
                          className="btn-primary text-xs flex items-center gap-1.5"
                        >
                          {sendingMessage
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Send className="w-3.5 h-3.5" />}
                          Send message
                        </button>
                      </div>
                    </div>
                  )}

                  {showHumanSchedule && (
                    <div id="pipeline-step-10" className="scroll-mt-24 p-4 rounded-xl border border-aqua/25 bg-aqua/5 space-y-3">
                      <p className="text-xs font-semibold text-label flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" /> Schedule human panel (Step 10)
                      </p>
                      <p className="text-xs text-muted">
                        Like great-harness-agent — candidate gets meeting invite only; each interviewer Gmail gets full AI screening + interview briefing with resume attached.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-label block mb-0.5">Date</label>
                          <input type="date" value={humanDate} onChange={(e) => setHumanDate(e.target.value)} className="input-field text-sm" />
                        </div>
                        <div>
                          <label className="text-[10px] text-label block mb-0.5">Time</label>
                          <input type="time" value={humanTime} onChange={(e) => setHumanTime(e.target.value)} className="input-field text-sm" />
                        </div>
                        <div>
                          <label className="text-[10px] text-label block mb-0.5">Duration (min)</label>
                          <input
                            type="number"
                            min={30}
                            max={180}
                            value={humanDuration}
                            onChange={(e) => setHumanDuration(Number(e.target.value) || 60)}
                            className="input-field text-sm"
                          />
                        </div>
                      </div>
                      {calendarConfigured ? (
                        <p className="text-xs text-accent bg-aqua/10 border border-aqua/20 rounded-lg px-3 py-2">
                          Google Calendar connected — Meet link will be auto-created when you schedule (like the reference repo).
                        </p>
                      ) : (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          Calendar not configured — place <code className="text-[10px]">credentials.json</code> + run <code className="text-[10px]">node scripts/google-calendar-auth.js</code>, or paste a Meet link below.
                        </p>
                      )}
                      <label className="flex items-center gap-2 text-xs text-body cursor-pointer">
                        <input type="checkbox" checked={useCustomMeetLink} onChange={(e) => setUseCustomMeetLink(e.target.checked)} className="accent-accent" />
                        Use custom Google Meet link instead of auto-create
                      </label>
                      {useCustomMeetLink && (
                        <input
                          value={meetLink}
                          onChange={(e) => setMeetLink(e.target.value)}
                          placeholder="https://meet.google.com/..."
                          className="input-field text-sm"
                        />
                      )}

                      {selected.candidateEmail && (
                        <p className="text-xs text-body bg-cream/60 rounded-lg px-3 py-2">
                          Candidate invite → <strong>{selected.candidateName}</strong> at <strong>{selected.candidateEmail}</strong> (from application, not added to panel list).
                        </p>
                      )}

                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-label">Interviewers — enter Gmail(s) to receive briefing email</p>
                        {panelInterviewers.map((row, index) => (
                          <div key={`row-${index}`} className="panel-interviewer-row">
                            <input value={row.name} onChange={(e) => updatePanelInterviewer(index, "name", e.target.value)} placeholder="Name (optional)" className="input-field text-sm panel-field-name" />
                            <input value={row.email} onChange={(e) => updatePanelInterviewer(index, "email", e.target.value)} placeholder="interviewer@gmail.com" type="email" className="input-field text-sm panel-field-email" required />
                            <input value={row.role} onChange={(e) => updatePanelInterviewer(index, "role", e.target.value)} placeholder="Role (optional)" className="input-field text-sm panel-field-role" />
                            <button type="button" onClick={() => removePanelInterviewer(index)} disabled={panelInterviewers.length <= 1} className="panel-field-action p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 w-full sm:w-auto" aria-label="Remove"><Trash2 className="w-4 h-4 mx-auto sm:mx-0" /></button>
                          </div>
                        ))}
                        <button type="button" onClick={addInterviewerRow} className="btn-secondary text-xs flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" /> Add another interviewer
                        </button>
                      </div>

                      <RichTextEditor
                        value={humanNotes}
                        onChange={setHumanNotes}
                        placeholder="Optional notes for candidate email…"
                        minHeight="72px"
                        variant="minimal"
                        className="text-sm"
                      />
                      <button onClick={scheduleHumanInterview} disabled={schedulingHuman || panelInterviewers.length === 0 || actionBusy} className="btn-primary text-xs flex items-center gap-1.5">
                        {schedulingHuman ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                        Schedule panel &amp; send emails
                      </button>
                    </div>
                  )}

                  {selected.humanInterview?.status === "scheduled" && (
                    <div id="pipeline-step-10" className="scroll-mt-24 p-4 rounded-xl border border-aqua/20 bg-cream/40 text-sm space-y-1">
                      <p className="text-xs font-semibold text-label flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Human panel scheduled
                      </p>
                      <p className="text-body">{selected.humanInterview.interviewDate} at {selected.humanInterview.interviewTime}</p>
                      {(selected.humanInterview.interviewers?.length ?? 0) > 0 && (
                        <p className="text-xs text-muted">
                          Panel: {selected.humanInterview.interviewers!.map((i) => `${i.name} (${i.role || "Panel"})`).join(", ")}
                        </p>
                      )}
                      {selected.humanInterview.meetLink && (
                        <a href={selected.humanInterview.meetLink} target="_blank" rel="noopener noreferrer" className="text-accent text-xs hover:underline">
                          {selected.humanInterview.meetLink}
                        </a>
                      )}
                    </div>
                  )}

                  {showMarkPanelComplete && (
                    <div id="pipeline-step-11" className="scroll-mt-24 p-4 rounded-xl border border-violet-200 bg-violet-50/40 space-y-3">
                      <p className="text-xs font-semibold text-label flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Mark human panel complete (Step 11)
                      </p>
                      <p className="text-xs text-muted">
                        After the panel round, mark complete to unlock offer or rejection emails.
                      </p>
                      <RichTextEditor
                        value={panelCompleteNotes}
                        onChange={setPanelCompleteNotes}
                        placeholder="Optional panel feedback (strengths, concerns, recommendation)…"
                        minHeight="72px"
                        variant="minimal"
                        className="text-sm"
                      />
                      <button
                        onClick={completeHumanPanel}
                        disabled={completingPanel || actionBusy}
                        className="btn-primary text-xs flex items-center gap-1.5"
                      >
                        {completingPanel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Panel completed — proceed to final decision
                      </button>
                    </div>
                  )}

                  {selected.humanInterview?.status === "completed" && !selected.finalDecision?.decision && (
                    <div id="pipeline-step-11" className="scroll-mt-24 p-3 rounded-xl border border-green-200 bg-green-50/50 text-xs text-body">
                      Human panel completed
                      {selected.humanInterview.completedByName && ` by ${selected.humanInterview.completedByName}`}
                      {selected.humanInterview.panelNotes && (
                        <RichTextContent content={selected.humanInterview.panelNotes} variant="on-light" className="mt-2 text-xs" />
                      )}
                    </div>
                  )}

                  {showFinalDecision && (
                    <div id="pipeline-step-12" className="scroll-mt-24 p-4 rounded-xl border border-green-200 bg-green-50/40 space-y-3">
                      <p className="text-xs font-semibold text-label flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5" /> Final decision (Step 12)
                      </p>
                      <p className="text-xs text-muted">
                        Offer or rejection email goes to <strong>{selected.candidateEmail}</strong> only — like great-harness-agent.
                      </p>
                      <div>
                        <label className="text-[10px] text-label block mb-0.5">
                          Compensation for {selected.jobTitle} <span className="text-red-600">*</span> (required for offer)
                        </label>
                        <input
                          value={finalSalary}
                          onChange={(e) => setFinalSalary(e.target.value)}
                          placeholder="e.g. ₹12 LPA, $95,000/year, 18 LPA + ESOP"
                          className="input-field text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-label block mb-0.5">Proposed start date (optional)</label>
                        <input type="date" value={finalStartDate} onChange={(e) => setFinalStartDate(e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-label block mb-0.5">Gender (for maternity leave entitlement)</label>
                        <select value={finalGender} onChange={(e) => setFinalGender(e.target.value as "male" | "female" | "other")} className="input-field text-sm">
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="other">Other / prefer not to say</option>
                        </select>
                      </div>
                      <p className="text-xs text-muted bg-cream/60 rounded-lg px-3 py-2">
                        Employee is created only after the candidate accepts the offer in Job Openings.
                      </p>
                      <RichTextEditor
                        value={finalMessage}
                        onChange={setFinalMessage}
                        placeholder="Optional personal note in the offer or rejection email…"
                        minHeight="72px"
                        variant="minimal"
                        className="text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => submitFinalDecision("selected")}
                          disabled={finalDecisionAction !== null || !finalSalary.trim() || actionBusy}
                          className="btn-primary text-xs flex items-center gap-1"
                        >
                          {finalDecisionAction === "selected" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                          Send offer email
                        </button>
                        <button
                          onClick={() => submitFinalDecision("rejected")}
                          disabled={finalDecisionAction !== null || actionBusy}
                          className="btn-secondary text-xs text-red-600 flex items-center gap-1"
                        >
                          {finalDecisionAction === "rejected" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                          Send rejection email
                        </button>
                      </div>
                    </div>
                  )}

                  {selected.finalDecision?.decision && (
                    <div id="pipeline-step-12" className={`scroll-mt-24 p-4 rounded-xl border text-sm ${selected.finalDecision.decision === "selected" ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/40"}`}>
                      <p className="font-semibold text-heading capitalize">Final: {selected.finalDecision.decision}</p>
                      {selected.finalDecision.decision === "selected" && (
                        <p className="text-body text-xs mt-1">
                          Offer response:{" "}
                          <span className="font-semibold capitalize">
                            {selected.finalDecision.offerResponse === "accepted"
                              ? "Accepted — employee onboarded"
                              : selected.finalDecision.offerResponse === "rejected"
                                ? "Declined by candidate"
                                : selected.status === "offer_pending"
                                  ? "Pending — awaiting candidate in portal"
                                  : selected.finalDecision.offerResponse || "Pending"}
                          </span>
                        </p>
                      )}
                      {selected.finalDecision.salary && <p className="text-body">Salary: {selected.finalDecision.salary}</p>}
                      {selected.finalDecision.startDate && <p className="text-body">Start: {selected.finalDecision.startDate}</p>}
                      {selected.finalDecision.candidateNote && (
                        <p className="text-body text-xs mt-1">Candidate note: {selected.finalDecision.candidateNote}</p>
                      )}
                      {selected.finalDecision.message && (
                        <RichTextContent content={selected.finalDecision.message} variant="on-light" className="text-sm mt-2" />
                      )}
                    </div>
                  )}

                  {showBottomShortlistReject && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {!isShortlisted && (
                        <button
                          onClick={() => updateStatus("shortlisted")}
                          disabled={statusAction !== null || actionBusy}
                          className="btn-primary text-xs inline-flex items-center gap-1"
                        >
                          {statusAction === "shortlisted" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          Shortlist
                        </button>
                      )}
                      <button
                        onClick={() => updateStatus("rejected", selected.interview?.status === "completed" ? "interview" : "screening")}
                        disabled={statusAction !== null || actionBusy}
                        className="btn-secondary text-xs text-red-600 inline-flex items-center gap-1"
                      >
                        {statusAction === "rejected" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Reject
                      </button>
                    </div>
                  )}

                  {!showAiReviewPanel && <div id="pipeline-step-9" className="scroll-mt-24" aria-hidden />}
                  {!showHumanSchedule && selected.humanInterview?.status !== "scheduled" && <div id="pipeline-step-10" className="scroll-mt-24" aria-hidden />}
                  {!showMarkPanelComplete && selected.humanInterview?.status !== "completed" && <div id="pipeline-step-11" className="scroll-mt-24" aria-hidden />}
                  {!showFinalDecision && !selected.finalDecision?.decision && <div id="pipeline-step-12" className="scroll-mt-24" aria-hidden />}
                </div>
              </GlassCard>
            </motion.div>
          ) : (
            <GlassCard className="text-center py-16" hover={false}>
              <Users className="w-12 h-12 text-accent/30 mx-auto mb-4" />
              <p className="text-muted">Select an application to review and schedule interview</p>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
