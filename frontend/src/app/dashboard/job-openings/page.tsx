"use client";

import { useEffect, useState, useCallback } from "react";
import { usePipelineHashScroll } from "@/hooks/usePipelineHashScroll";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import {
  Briefcase, MapPin, CheckCircle, Loader2, Send, Upload, FileText, User, Calendar, Video,
  ThumbsUp, ThumbsDown,
} from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import PageHeader from "@/components/ui/PageHeader";
import RichTextContent from "@/components/ui/RichTextContent";
import RichTextEditor, { getRichHtml } from "@/components/ui/RichTextEditor";
import { jobsAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ApplicationStatusBadge from "@/components/ui/ApplicationStatusBadge";
import RejectedNotice from "@/components/ui/RejectedNotice";
import {
  isApplicationRejected, isScreeningRejected, SCREENING_PASS_THRESHOLD,
} from "@/lib/applicationStatus";
import { dispatchNotificationsRefresh, NOTIFICATIONS_REFRESH_EVENT } from "@/lib/notificationEvents";
import { getApiErrorMessage } from "@/lib/errors";
import HiringFlowSteps, { CANDIDATE_APPLY_STEPS } from "@/components/hiring/HiringFlowSteps";
import HiringPipelineFlow from "@/components/hiring/HiringPipelineFlow";
import {
  getPipelineStep, pipelineStatusLabel, isOfferPending, isCandidateRejected, type HumanInterview, type FinalDecision,
} from "@/lib/hiringPipeline";

interface Job {
  id: number;
  title: string;
  description: string;
  required_skills?: string[];
  skills?: string[];
  experience_level?: string;
  experienceLevel?: string;
  created_by_name?: string;
  createdByName?: string;
  posted_at?: string;
  createdAt?: string;
  applied?: boolean;
}

interface Application {
  id: number;
  jobId: number;
  jobTitle: string;
  status: string;
  jdScore?: number;
  appliedAt: string;
  interview?: {
    status: string;
    recommendation?: string;
    finalScore?: number;
  } | null;
  humanInterview?: HumanInterview | null;
  finalDecision?: FinalDecision | null;
}

const APPLY_STEPS = ["Review JD", "Upload resume", "Match skills", "Submit"];

export default function JobOpeningsPage() {
  const { user, refreshUser } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [applyStep, setApplyStep] = useState(0);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [coverNote, setCoverNote] = useState("");
  const [highlightedSkills, setHighlightedSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [lastResult, setLastResult] = useState<{
    jd_score: number;
    jobTitle: string;
    rejected?: boolean;
  } | null>(null);
  const [respondingOfferId, setRespondingOfferId] = useState<number | null>(null);

  const load = () => {
    jobsAPI.list().then((r) => setJobs(r.data)).catch(() => {});
    jobsAPI.myApplications().then((r) => setApplications(r.data)).catch(() => {});
  };

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    const t = setInterval(load, 10000);
    return () => {
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
      clearInterval(t);
    };
  }, []);

  usePipelineHashScroll();

  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.email) setEmail(user.email);
  }, [user]);

  const skills = (j: Job) => j.required_skills || j.skills || [];
  const applicationForJob = (jobId: number) => applications.find((a) => a.jobId === jobId);

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) {
      setResumeFile(files[0]);
      setApplyStep(Math.max(applyStep, 2));
    }
  }, [applyStep]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    multiple: false,
  });

  const toggleSkill = (skill: string) => {
    setHighlightedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const handleApply = async () => {
    if (!selected || !resumeFile) {
      toast.error("Upload your resume (PDF or DOCX)");
      return;
    }
    setApplying(true);
    try {
      const form = new FormData();
      form.append("resume", resumeFile);
      form.append("name", name);
      form.append("phone", phone);
      form.append("contact_email", email);
      form.append("cover_note", getRichHtml(coverNote));
      form.append("highlighted_skills", JSON.stringify(highlightedSkills));

      const { data } = await jobsAPI.apply(selected.id, form);

      if (data.screening_in_progress) {
        toast.success(
          data.message || "Application received! AI is screening your resume — you'll be notified shortly.",
          { duration: 6000 },
        );
        dispatchNotificationsRefresh();
        setResumeFile(null);
        setCoverNote("");
        setApplyStep(0);
        load();
        setSelected((prev) => (prev ? { ...prev, applied: true } : null));
        return;
      }

      const jdScore = data.jd_score || 0;
      const autoShortlisted = Boolean(data.auto_shortlisted);
      setLastResult({ jd_score: jdScore, jobTitle: selected.title, rejected: false });
      const verdict = data.screening?.verdict || data.application?.recommendation;
      toast.success(
        autoShortlisted
          ? `Applied! Score ${Math.round(jdScore)}/100 — auto-shortlisted. HR will schedule your AI interview.`
          : verdict
            ? `Applied! ${verdict} (${Math.round(jdScore)}/100) — awaiting HR shortlist`
            : `Applied! Score ${Math.round(jdScore)}/100 — awaiting HR shortlist`,
      );
      dispatchNotificationsRefresh();
      setResumeFile(null);
      setCoverNote("");
      setApplyStep(0);
      load();
      setSelected((prev) => (prev ? { ...prev, applied: true } : null));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to apply"));
    } finally {
      setApplying(false);
    }
  };

  const handleOfferResponse = async (appId: number, response: "accepted" | "rejected") => {
    const label = response === "accepted" ? "accept" : "decline";
    if (!window.confirm(`Are you sure you want to ${label} this offer?`)) return;
    setRespondingOfferId(appId);
    try {
      const { data } = await jobsAPI.offerResponse(appId, { response });
      toast.success((data as { message?: string }).message || `Offer ${response}`);
      dispatchNotificationsRefresh();
      load();
      if (response === "accepted") {
        await refreshUser();
        window.location.href = "/dashboard";
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, `Failed to ${label} offer`));
    } finally {
      setRespondingOfferId(null);
    }
  };

  const selectJob = async (job: Job) => {
    setLoading(true);
    setApplyStep(0);
    setResumeFile(null);
    setHighlightedSkills([]);
    setLastResult(null);
    try {
      const { data } = await jobsAPI.get(job.id);
      setSelected(data);
      setHighlightedSkills([]);
    } catch {
      setSelected(job);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Job Openings"
        subtitle="Apply with your resume — AI screens you against the job description"
        icon={Briefcase}
      />

      <GlassCard hover={false} className="mb-6">
        <h3 className="font-bold text-heading mb-2 text-sm">Your application flow</h3>
        <HiringFlowSteps steps={CANDIDATE_APPLY_STEPS} />
      </GlassCard>

      {lastResult && (
        <GlassCard className="mb-6 border border-aqua/30" hover={false}>
          <p className="font-bold text-heading">
            Application submitted for {lastResult.jobTitle}
          </p>
          <p className="text-sm mt-1 text-muted">
            Screening score: <span className="font-bold text-accent">{Math.round(lastResult.jd_score)}/100</span>
            {" — recruiter notified. HR screening will decide next steps (like great-harness-agent)."}
          </p>
        </GlassCard>
      )}

      {applications.length > 0 && (
        <div id="progress" className="scroll-mt-24 mb-6">
        <GlassCard hover={false}>
          <h3 className="font-bold text-heading mb-3">My Applications</h3>
          <div className="data-table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-label border-b border-aqua/15">
                  <th className="py-2 pr-3 font-semibold">Role</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Progress</th>
                  <th className="py-2 font-semibold">Offer</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => {
                  const rejected = isCandidateRejected(a) || isApplicationRejected(a.status, a.interview);
                  const hired = a.status === "hired" || a.finalDecision?.offerResponse === "accepted";
                  const offerPending = isOfferPending(a) && !rejected;
                  return (
                    <tr
                      key={a.id}
                      className={`border-b border-aqua/10 ${
                        rejected ? "bg-red-50/50" : hired ? "bg-green-50/40" : offerPending ? "bg-amber-50/40" : ""
                      }`}
                    >
                      <td className="py-3 pr-3 font-medium text-heading align-top">{a.jobTitle}</td>
                      <td className="py-3 pr-3 align-top">
                        <ApplicationStatusBadge status={a.status} size="xs" />
                      </td>
                      <td className="py-3 pr-3 text-xs text-muted align-top">{pipelineStatusLabel(a)}</td>
                      <td className="py-3 align-top">
                        {offerPending ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleOfferResponse(a.id, "accepted")}
                              disabled={respondingOfferId === a.id}
                              className="btn-primary text-xs inline-flex items-center gap-1"
                            >
                              {respondingOfferId === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOfferResponse(a.id, "rejected")}
                              disabled={respondingOfferId === a.id}
                              className="btn-secondary text-xs text-red-600 inline-flex items-center gap-1"
                            >
                              <ThumbsDown className="w-3 h-3" /> Decline
                            </button>
                          </div>
                        ) : hired ? (
                          <span className="text-xs text-green-700 font-medium">Accepted</span>
                        ) : a.finalDecision?.offerResponse === "rejected" || a.status === "offer_declined" ? (
                          <span className="text-xs text-muted">Declined</span>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
        </div>
      )}

      <div className="split-layout gap-4 sm:gap-6">
        <div id="browse-jobs" className="split-layout-side scroll-mt-24">
        <GlassCard hover={false}>
          <h3 className="font-bold text-heading mb-4">Open Positions ({jobs.length})</h3>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => selectJob(j)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  selected?.id === j.id ? "border-aqua bg-aqua/10" : "border-aqua/10 hover:bg-cream/50"
                }`}
              >
                <p className="font-medium text-heading text-sm">{j.title}</p>
                <p className="text-xs text-muted mt-1">
                  {j.created_by_name || j.createdByName || "Recruiter"}
                  {j.applied && <span className="text-accent ml-2">· Applied</span>}
                </p>
              </button>
            ))}
          </div>
        </GlassCard>
        </div>

        <div className="split-layout-main">
          {selected ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <GlassCard hover={false}>
                <h2 className="text-xl font-bold text-heading mb-1">{selected.title}</h2>
                <p className="text-xs text-muted flex items-center gap-1 mb-4">
                  <MapPin className="w-3 h-3" />
                  Posted by {selected.created_by_name || selected.createdByName || "HR Recruiter"}
                </p>

                <div className="flex flex-wrap gap-2 mb-4">
                  {skills(selected).map((s) => (
                    <span key={s} className="tag-skill text-xs">{s}</span>
                  ))}
                </div>

                <div className="prose-sm mb-6 text-body max-h-48 overflow-y-auto">
                  <RichTextContent content={selected.description || ""} variant="on-light" />
                </div>

                {selected.applied ? (() => {
                  const app = applicationForJob(selected.id);
                  const rejected = app ? isCandidateRejected(app) || isApplicationRejected(app.status, app.interview) : false;
                  if (rejected) {
                    const screeningOnly = app ? isScreeningRejected(app.jdScore) && app.status === "rejected" : false;
                    return (
                      <div className="border-t border-aqua/10 pt-4 space-y-3">
                        <RejectedNotice audience="candidate" reason={screeningOnly ? "screening" : "interview"} />
                        <ApplicationStatusBadge status={app?.status || "rejected"} interview={app?.interview} size="sm" />
                      </div>
                    );
                  }
                  return (
                    <div className="border-t border-aqua/10 pt-4 space-y-4">
                      <div className="flex items-center gap-2 text-accent font-semibold">
                        <CheckCircle className="w-5 h-5" /> {pipelineStatusLabel(app) || "You applied — awaiting recruiter review"}
                        <ApplicationStatusBadge status={app?.status || "applied"} size="xs" className="ml-2" />
                      </div>
                      {app && (
                        <div className="scroll-mt-24">
                          <p className="text-xs font-semibold text-label mb-2">Your hiring progress</p>
                          <HiringPipelineFlow currentStep={getPipelineStep(app)} candidate linkable />
                        </div>
                      )}
                      {app && !app.humanInterview?.status && <div id="human-panel" className="scroll-mt-24" aria-hidden />}
                      {app && !isOfferPending(app) && app.finalDecision?.offerResponse !== "accepted" && app.status !== "hired" && (
                        <div id="offer" className="scroll-mt-24" aria-hidden />
                      )}
                      {app?.humanInterview?.status === "scheduled" && (
                        <div id="human-panel" className="scroll-mt-24 p-4 rounded-xl border border-aqua/25 bg-aqua/5 text-sm space-y-2">
                          <p className="text-xs font-semibold text-label flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" /> Human interview scheduled
                          </p>
                          <p className="text-body">
                            {app.humanInterview.interviewDate} at {app.humanInterview.interviewTime}
                          </p>
                          {app.humanInterview.meetLink && (
                            <a
                              href={app.humanInterview.meetLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-primary text-xs inline-flex items-center gap-1.5"
                            >
                              <Video className="w-3.5 h-3.5" /> Join meeting
                            </a>
                          )}
                          {app.humanInterview.notes && (
                            <RichTextContent content={app.humanInterview.notes} variant="on-light" className="text-xs" />
                          )}
                        </div>
                      )}
                      {app && isOfferPending(app) && (
                        <div id="offer" className="scroll-mt-24 p-4 rounded-xl border border-amber-200 bg-amber-50/60 text-sm space-y-3">
                          <p className="font-semibold text-heading">
                            {app.finalDecision?.offerLetterSubject || "Offer letter — action required"}
                          </p>
                          <p className="text-body text-xs">
                            Your offer letter is below and was also sent to your email from our HR team.
                            Accept or decline to notify HR via the hiring agent.
                          </p>
                          {app.finalDecision?.offerLetterHtml ? (
                            <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-aqua/20 bg-white/80 p-3 sm:p-4 max-h-[min(70vh,28rem)] overflow-y-auto">
                              <div
                                className="offer-letter-preview prose-sm sm:prose-base max-w-none"
                                dangerouslySetInnerHTML={{ __html: app.finalDecision.offerLetterHtml }}
                              />
                            </div>
                          ) : (
                            <>
                              {app.finalDecision?.salary && <p className="text-body"><strong>Compensation:</strong> {app.finalDecision.salary}</p>}
                              {app.finalDecision?.startDate && <p className="text-body"><strong>Start date:</strong> {app.finalDecision.startDate}</p>}
                              {app.finalDecision?.message && (
                                <RichTextContent content={app.finalDecision.message} variant="on-light" className="text-xs" />
                              )}
                            </>
                          )}
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleOfferResponse(app.id, "accepted")}
                              disabled={respondingOfferId === app.id}
                              className="btn-primary text-xs inline-flex items-center gap-1.5"
                            >
                              {respondingOfferId === app.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                              Accept offer
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOfferResponse(app.id, "rejected")}
                              disabled={respondingOfferId === app.id}
                              className="btn-secondary text-xs text-red-600 inline-flex items-center gap-1.5"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" /> Decline offer
                            </button>
                          </div>
                        </div>
                      )}
                      {app && (app.status === "hired" || app.finalDecision?.offerResponse === "accepted") && (
                        <div className="p-4 rounded-xl border border-green-200 bg-green-50/50 text-sm">
                          <p className="font-semibold text-heading">Welcome aboard — offer accepted!</p>
                          {app.finalDecision?.salary && <p className="text-body">Offer: {app.finalDecision.salary}</p>}
                          {app.finalDecision?.startDate && <p className="text-body">Start: {app.finalDecision.startDate}</p>}
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div id="apply" className="scroll-mt-24 border-t border-aqua/10 pt-4">
                    <div className="flex flex-wrap gap-2 mb-4">
                      {APPLY_STEPS.map((label, i) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setApplyStep(i)}
                          className={`text-xs px-3 py-1.5 rounded-full border ${
                            applyStep === i ? "border-aqua bg-aqua/15 text-accent font-semibold" : "border-aqua/20 text-muted"
                          }`}
                        >
                          {i + 1}. {label}
                        </button>
                      ))}
                    </div>

                    {applyStep === 0 && (
                      <p className="text-sm text-body mb-4">
                        Read the job description and required skills above. Continue to upload your resume.
                      </p>
                    )}

                    {applyStep >= 1 && (
                      <div className="space-y-4 mb-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-label block mb-1">Full name</label>
                            <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
                          </div>
                          <div>
                            <label className="text-xs text-label block mb-1">Phone</label>
                            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" placeholder="+1..." />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs text-label block mb-1">Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" />
                          </div>
                        </div>

                        <div
                          {...getRootProps()}
                          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer ${
                            isDragActive ? "border-aqua bg-aqua/5" : "border-aqua/30"
                          }`}
                        >
                          <input {...getInputProps()} />
                          <Upload className="w-8 h-8 text-accent mx-auto mb-2" />
                          {resumeFile ? (
                            <p className="text-sm text-heading font-medium flex items-center justify-center gap-2">
                              <FileText className="w-4 h-4" /> {resumeFile.name}
                            </p>
                          ) : (
                            <p className="text-sm text-muted">Drop PDF/DOCX resume here (required)</p>
                          )}
                        </div>
                      </div>
                    )}

                    {applyStep >= 2 && skills(selected).length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-label mb-2">
                          Highlight JD skills you have (from resume + your input)
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {skills(selected).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => toggleSkill(s)}
                              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                                highlightedSkills.includes(s)
                                  ? "border-aqua bg-aqua text-inverse"
                                  : "border-aqua/30 text-body hover:border-aqua"
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {applyStep >= 3 && (
                      <div className="mb-4">
                        <label className="text-xs text-label block mb-1">Why you fit this role (optional)</label>
                        <RichTextEditor
                          value={coverNote}
                          onChange={setCoverNote}
                          placeholder="Brief note to recruiter..."
                          minHeight="96px"
                          variant="minimal"
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {applyStep < 3 && (
                        <button
                          type="button"
                          onClick={() => setApplyStep((s) => Math.min(3, s + 1))}
                          disabled={applyStep === 1 && !resumeFile}
                          className="btn-secondary"
                        >
                          Next
                        </button>
                      )}
                      {applyStep >= 2 && (
                        <button
                          onClick={handleApply}
                          disabled={applying || loading || !resumeFile}
                          className="btn-primary flex items-center gap-2"
                        >
                          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          {applying ? "Analyzing resume…" : "Submit application"}
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-muted mt-3 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      Resume is parsed and scored against this JD before the recruiter sees your application.
                    </p>
                  </div>
                )}
              </GlassCard>
            </motion.div>
          ) : (
            <GlassCard className="text-center py-16" hover={false}>
              <Briefcase className="w-12 h-12 text-accent/30 mx-auto mb-4" />
              <p className="text-muted">Select a job to view details and apply</p>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
