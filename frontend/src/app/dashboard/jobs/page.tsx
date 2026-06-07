"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { usePipelineHashScroll } from "@/hooks/usePipelineHashScroll";
import { getPipelineStepHref } from "@/lib/hiringPipeline";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Briefcase, Sparkles, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Loader2, FileText, ExternalLink, Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";
import GlassCard from "@/components/ui/GlassCard";
import RichTextEditor, { getRichHtml } from "@/components/ui/RichTextEditor";
import RichTextContent from "@/components/ui/RichTextContent";
import { toEditorHtml } from "@/lib/tiptapContent";
import { jobsAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { isRecruiterRole } from "@/lib/roleAccess";
import HiringPipelineFlow from "@/components/hiring/HiringPipelineFlow";
import JdReviewPanel from "@/components/hiring/JdReviewPanel";
import type { JdJson, PipelineStep, SkillsMatrix } from "@/lib/jdFormat";
import { KB_GENERATION_STEPS, MANUAL_JD_STEPS } from "@/components/hiring/JdPipelineProgress";
import { setLiveJd, clearLiveJd } from "@/lib/jdLiveStorage";
import { getPlainText } from "@/lib/richTextUtils";

const ORG_DISPLAY_NAME = process.env.NEXT_PUBLIC_ORG_NAME || "XYZ";

const EXPERIENCE_PRESETS = [
  { value: "0-2 years", label: "0-2 years (Fresher / Entry)" },
  { value: "2 years", label: "2 years" },
  { value: "2-4 years", label: "2-4 years (Mid)" },
  { value: "3+ years", label: "3+ years" },
  { value: "5+ years", label: "5+ years (Senior)" },
  { value: "8+ years", label: "8+ years (Lead / Principal)" },
  { value: "custom", label: "Custom…" },
] as const;

interface Job {
  id: number;
  title: string;
  description: string;
  required_skills: string[];
  experience_level: string;
  interview_questions: { question: string; type: string; difficulty: string }[];
  difficulty_level: string;
  salary_insights: { range_low: number; range_high: number; currency: string };
  applicant_count?: number;
  skills?: string[];
  status?: string;
  generated_by?: string;
  kb_repos?: string[];
  employment_type?: string;
  department?: string;
  nice_to_have_skills?: string[];
  skills_matrix?: SkillsMatrix | null;
  jd_json?: JdJson | null;
  tech_stack_profile?: Record<string, unknown> | null;
  pipeline?: PipelineStep[];
  org_name?: string;
}

interface Applicant {
  id: number;
  candidateName: string;
  candidateEmail: string;
  status: string;
  appliedAt: string;
  coverNote?: string;
}

export default function JobsPage() {
  const { user } = useAuth();
  const isRecruiter = isRecruiterRole(user?.role);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("2 years");
  const [experiencePreset, setExperiencePreset] = useState("2 years");
  const [department, setDepartment] = useState("Engineering");
  const [employmentType, setEmploymentType] = useState<"full_time" | "internship">("full_time");
  const [loading, setLoading] = useState(false);
  const [showManualJd, setShowManualJd] = useState(false);
  const [pipelineMode, setPipelineMode] = useState<"kb" | "manual" | null>(null);
  const [pipelineStep, setPipelineStep] = useState(0);
  const pipelineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selected, setSelected] = useState<Job | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [draftDescription, setDraftDescription] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [showJdEditor, setShowJdEditor] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(1);

  useEffect(() => {
    jobsAPI.list().then((r) => setJobs(r.data)).catch(() => {});
  }, []);

  const focusPipelineStep = useCallback((id: number) => {
    setExpandedStep(id);
  }, []);
  usePipelineHashScroll(focusPipelineStep);

  useEffect(() => () => {
    if (pipelineTimerRef.current) clearInterval(pipelineTimerRef.current);
  }, []);

  useEffect(() => {
    if (!selected?.id) return;
    const html = getRichHtml(draftDescription || toEditorHtml(selected.description || ""));
    setLiveJd(selected.id, html, draftTitle || selected.title);
  }, [selected?.id, selected?.description, selected?.title, draftDescription, draftTitle]);

  const startPipelineProgress = useCallback((mode: "kb" | "manual") => {
    if (pipelineTimerRef.current) clearInterval(pipelineTimerRef.current);
    setPipelineMode(mode);
    setPipelineStep(0);
    pipelineTimerRef.current = setInterval(() => {
      setPipelineStep((s) => s + 1);
    }, 2200);
  }, []);

  const finishPipelineProgress = useCallback(async () => {
    if (pipelineTimerRef.current) {
      clearInterval(pipelineTimerRef.current);
      pipelineTimerRef.current = null;
    }
    await new Promise((r) => setTimeout(r, 500));
    setPipelineMode(null);
    setPipelineStep(0);
  }, []);

  const handleExperiencePreset = (value: string) => {
    setExperiencePreset(value);
    if (value !== "custom") setExperienceLevel(value);
  };

  const selectJob = async (job: Job) => {
    try {
      const { data } = await jobsAPI.get(job.id);
      setSelected(data);
      setDraftTitle(data.title || "");
      setDraftDescription(toEditorHtml(data.description || ""));
      if (data.employment_type) setEmploymentType(data.employment_type as "full_time" | "internship");
      if (data.department) setDepartment(data.department);
      if (isRecruiter) {
        jobsAPI.jobApplications(job.id).then((r) => setApplicants(r.data.applications || [])).catch(() => setApplicants([]));
      }
    } catch {
      setSelected(job);
    }
  };

  const jobSkills = (j: Job) => j.required_skills || j.skills || [];

  const apiErrorMessage = (err: unknown, fallback: string) => {
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { error?: string; detail?: string } | undefined;
      return data?.error || data?.detail || err.message || fallback;
    }
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  };

  const generateFromKB = async () => {
    if (!title.trim()) {
      toast.error("Enter a role title first (e.g. Full Stack Developer)");
      return;
    }
    if (!experienceLevel.trim()) {
      toast.error("Enter experience level (e.g. 2 years)");
      return;
    }
    setLoading(true);
    startPipelineProgress("kb");
    try {
      const { data } = await jobsAPI.generateFromKB({
        role_title: title,
        experience_level: experienceLevel,
        department,
        employment_type: employmentType,
      });
      setPipelineStep(KB_GENERATION_STEPS.length);
      setJobs((prev) => [data, ...prev]);
      setSelected(data);
      await finishPipelineProgress();
      setDraftTitle(data.title || "");
      setDraftDescription(toEditorHtml(data.description || ""));
      if (data.employment_type) setEmploymentType(data.employment_type as "full_time" | "internship");
      if (data.department) setDepartment(data.department);
      setExpandedStep(2);
      toast.success(`JD drafted via Groq — review in Step 2`);
    } catch (err) {
      if (pipelineTimerRef.current) clearInterval(pipelineTimerRef.current);
      setPipelineMode(null);
      setPipelineStep(0);
      toast.error(apiErrorMessage(err, "Groq JD generation failed. Check ML service and GROQ_API_KEY."));
    } finally {
      setLoading(false);
    }
  };

  const approveDraft = async () => {
    if (!selected) return;
    const richDescription = getRichHtml(draftDescription);
    if (!draftTitle.trim() || !richDescription) {
      toast.error("Title and description are required to publish");
      return;
    }
    setLoading(true);
    try {
      const { data } = await jobsAPI.approveJob(selected.id, {
        title: draftTitle.trim(),
        description: richDescription,
        employment_type: employmentType,
        department,
      });
      setSelected(data);
      setDraftTitle(data.title || "");
      setDraftDescription(toEditorHtml(data.description || ""));
      clearLiveJd(data.id);
      setJobs((prev) => prev.map((j) => (j.id === data.id ? data : j)));
      setExpandedStep(4);
      toast.success("Job published — continue at Step 4");
    } catch {
      toast.error("Failed to approve job");
    } finally {
      setLoading(false);
    }
  };

  const rejectDraft = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      clearLiveJd(selected.id);
      await jobsAPI.rejectDraft(selected.id);
      setJobs((prev) => prev.filter((j) => j.id !== selected.id));
      setSelected(null);
      setExpandedStep(1);
      toast.success("Draft discarded");
    } catch {
      toast.error("Failed to discard draft");
    } finally {
      setLoading(false);
    }
  };

  const deleteJob = useCallback(async (job?: Job | null) => {
    const target = job ?? selected;
    if (!target) return;
    const isPublishedJob = target.status === "open";
    const confirmed = window.confirm(
      isPublishedJob
        ? `Remove "${target.title}" from Job Openings?\n\nThe job will no longer accept applications. Existing applications stay in your inbox.`
        : `Delete draft "${target.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      clearLiveJd(target.id);
      await jobsAPI.deleteJob(target.id);
      setJobs((prev) => prev.filter((j) => j.id !== target.id));
      if (selected?.id === target.id) {
        setSelected(null);
        setExpandedStep(1);
      }
      toast.success(isPublishedJob ? "Job removed from openings" : "Draft deleted");
    } catch {
      toast.error("Failed to delete job");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const handleCreate = async () => {
    const richDescription = getRichHtml(description);
    if (!title || !richDescription) {
      toast.error("Fill in title and description");
      return;
    }
    setLoading(true);
    startPipelineProgress("manual");
    try {
      const { data } = await jobsAPI.create({
        title,
        description: richDescription,
        employment_type: employmentType,
        department,
      });
      setPipelineStep(MANUAL_JD_STEPS.length);
      setJobs((prev) => [data, ...prev]);
      setSelected(data);
      await finishPipelineProgress();
      setTitle("");
      setDescription("");
      setShowManualJd(false);
      setDraftTitle(data.title || "");
      setDraftDescription(toEditorHtml(data.description || ""));
      if (data.employment_type) setEmploymentType(data.employment_type as "full_time" | "internship");
      if (data.department) setDepartment(data.department);
      setExpandedStep(2);
      toast.success("JD analyzed via Groq — review in Step 2");
    } catch (err) {
      if (pipelineTimerRef.current) clearInterval(pipelineTimerRef.current);
      setPipelineMode(null);
      setPipelineStep(0);
      toast.error(apiErrorMessage(err, "Groq JD analysis failed. Check ML service and GROQ_API_KEY."));
    } finally {
      setLoading(false);
    }
  };

  const activePipelineSteps = pipelineMode === "kb" ? KB_GENERATION_STEPS : MANUAL_JD_STEPS;
  const cappedPipelineStep = Math.min(
    pipelineStep,
    Math.max(0, activePipelineSteps.length - 1),
  );

  const hiringPipelineStep = (() => {
    if (loading && pipelineMode === "kb") {
      if (cappedPipelineStep <= 1) return 1;
      return 2;
    }
    if (loading && pipelineMode === "manual") return 2;
    if (selected?.status === "draft") return 3;
    if (selected?.status === "open") return 4;
    return 1;
  })();

  const pipelineActiveDetail = (() => {
    if (!loading || !pipelineMode) return undefined;
    const sub = activePipelineSteps[cappedPipelineStep];
    if (pipelineMode === "kb" && sub) {
      return `${sub.label}…`;
    }
    if (pipelineMode === "manual" && sub) {
      return `${sub.label}…`;
    }
    return undefined;
  })();

  const pipelineProcessing = loading && !!pipelineMode;

  useEffect(() => {
    setExpandedStep(hiringPipelineStep);
  }, [hiringPipelineStep]);

  const hasDraft = selected?.status === "draft";
  const isPublished = selected?.status === "open";

  const effectiveJdHtml = useMemo(() => {
    if (!selected) return "";
    return getRichHtml(draftDescription) || selected.description || "";
  }, [selected, draftDescription]);

  const jdHasEdits = useMemo(() => {
    if (!selected) return false;
    const saved = getPlainText(toEditorHtml(selected.description || ""));
    const current = getPlainText(draftDescription || "");
    return Boolean(current && current !== saved);
  }, [selected, draftDescription]);

  const stepPanels = useMemo((): Partial<Record<number, ReactNode>> => {
    if (!isRecruiter) return {};

    const locked = (msg: string, href: string, label: string) => (
      <div className="rounded-xl border border-aqua/10 bg-cream/30 p-4 text-sm text-muted space-y-3">
        <p>{msg}</p>
        <Link href={href} className="btn-secondary inline-flex text-xs py-2 px-4">{label}</Link>
      </div>
    );

    return {
      1: (
        <div className="space-y-4 min-w-0">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Role title (e.g. Full Stack Developer)"
            className="input-field"
            disabled={loading}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-label block mb-1">Experience level</label>
              <select
                value={experiencePreset}
                onChange={(e) => handleExperiencePreset(e.target.value)}
                className="input-field"
                disabled={loading}
              >
                {EXPERIENCE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {experiencePreset === "custom" && (
                <input
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  placeholder="e.g. 4 years"
                  className="input-field mt-2"
                  disabled={loading}
                />
              )}
            </div>
            <div>
              <label className="text-xs text-label block mb-1">Employment type</label>
              <select
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value as "full_time" | "internship")}
                className="input-field"
                disabled={loading}
              >
                <option value="full_time">Full-time (full pay)</option>
                <option value="internship">Internship</option>
              </select>
            </div>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Department"
              className="input-field sm:col-span-2"
              disabled={loading}
            />
          </div>
          <button
            onClick={generateFromKB}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading && pipelineMode === "kb" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading && pipelineMode === "kb" ? "Agent 1 analyzing…" : "Generate JD from Knowledge Base (Groq)"}
          </button>
          <div className="rounded-xl border border-aqua/20 bg-white/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowManualJd((v) => !v)}
              disabled={loading && pipelineMode === "kb"}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-aqua/5"
            >
              <span className="text-sm font-semibold text-heading flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent shrink-0" />
                Paste JD manually (optional)
              </span>
              {showManualJd ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showManualJd && (
              <div className="px-4 pb-4 space-y-3 border-t border-aqua/10 pt-3">
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Paste full job description here…"
                  minHeight="200px"
                  variant="full"
                />
                <button onClick={handleCreate} disabled={loading} className="btn-secondary w-full flex items-center justify-center gap-2">
                  {loading && pipelineMode === "manual" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {loading && pipelineMode === "manual" ? "Analyzing JD…" : "Analyze & Create (manual JD)"}
                </button>
              </div>
            )}
          </div>
        </div>
      ),

      2: selected && (hasDraft || selected.description) ? (
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Draft for <strong className="text-heading">{selected.title}</strong>
              {hasDraft ? " — review generated sections below" : ""}
            </p>
            <Link
              href={`/dashboard/jobs/${selected.id}/view`}
              className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5 shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              View JD
            </Link>
          </div>
          <JdReviewPanel
            description={effectiveJdHtml}
            skillsMatrix={selected.skills_matrix}
            jdJson={selected.jd_json}
            pipeline={selected.pipeline}
            preferDescription={jdHasEdits}
            hasEdits={jdHasEdits}
            orgName={selected.org_name || ORG_DISPLAY_NAME}
          />
        </div>
      ) : (
        <p className="text-sm text-muted italic p-4 bg-cream/40 rounded-xl">
          Complete Step 1 to generate a JD draft. It will appear here automatically.
        </p>
      ),

      3: hasDraft && selected ? (
        <div className="space-y-4 min-w-0 p-1">
          <p className="text-sm text-body">Review the JD draft, edit if needed, then publish to Job Openings.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value as "full_time" | "internship")} className="input-field">
              <option value="full_time">Full-time</option>
              <option value="internship">Internship</option>
            </select>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" className="input-field" />
          </div>
          <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className="input-field" placeholder="Job title" />
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/jobs/${selected.id}/view`}
              className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              View JD
            </Link>
            <a
              href={`/dashboard/jobs/${selected.id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted hover:text-heading inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Open in new tab
            </a>
            <span className="text-[11px] text-muted">Generated JD below updates as you edit</span>
          </div>
          <JdReviewPanel
            description={effectiveJdHtml}
            skillsMatrix={selected.skills_matrix}
            jdJson={selected.jd_json}
            pipeline={selected.pipeline}
            preferDescription={jdHasEdits}
            hasEdits={jdHasEdits}
            orgName={selected.org_name || ORG_DISPLAY_NAME}
          />
          <div className="rounded-xl border border-aqua/15 bg-white/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowJdEditor((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-heading hover:bg-aqua/5"
            >
              Edit full JD text
              <span className="text-xs text-muted font-normal">{showJdEditor ? "Hide" : "Show"}</span>
            </button>
            {showJdEditor && (
              <div className="px-4 pb-4 border-t border-aqua/10 pt-3">
                <RichTextEditor value={draftDescription} onChange={setDraftDescription} placeholder="Edit JD…" minHeight="220px" variant="full" />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={approveDraft} disabled={loading} className="btn-primary text-sm flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" />
              {loading ? "Publishing…" : "Approve & Post Job"}
            </button>
            <button onClick={rejectDraft} disabled={loading} className="btn-secondary text-sm text-red-600 flex items-center gap-1.5">
              <XCircle className="w-4 h-4" />
              Discard draft
            </button>
          </div>
        </div>
      ) : isPublished && selected ? (
        <div className="rounded-xl border border-green-200 bg-green-50/50 p-4 space-y-2">
          <p className="text-sm font-semibold text-green-800">Published — {selected.title}</p>
          <p className="text-xs text-body">Candidates can apply on Job Openings. Proceed to Step 4.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/jobs/${selected.id}/view`} className="btn-secondary inline-flex text-xs py-2 px-4 items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              View JD
            </Link>
            <Link href="/dashboard/job-openings" className="btn-secondary inline-flex text-xs py-2 px-4">View Job Openings</Link>
            <button
              type="button"
              onClick={() => void deleteJob()}
              disabled={loading}
              className="btn-secondary text-xs py-2 px-4 inline-flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete job
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted italic p-4 bg-cream/40 rounded-xl">Available after a JD draft is ready in Step 2.</p>
      ),

      4: isPublished && selected ? (
        <div className="space-y-3">
          {locked(
            `Job is live. Candidates apply with resume + cover note. Applicants: ${applicants.length}.`,
            getPipelineStepHref(4),
            "Open Job Openings",
          )}
          <button
            type="button"
            onClick={() => void deleteJob()}
            disabled={loading}
            className="btn-secondary text-xs py-2 px-4 inline-flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete job from openings
          </button>
        </div>
      ) : locked("Publish the job in Step 3 first.", getPipelineStepHref(4), "Job Openings (preview)"),

      5: locked("Resume screening runs when candidates apply.", getPipelineStepHref(5), "Go to Applications"),
      6: locked("HR shortlists or rejects screened candidates.", getPipelineStepHref(6), "HR Screening"),
      7: locked("Schedule AI interview after shortlist.", getPipelineStepHref(7), "Schedule Interview"),
      8: locked("Candidate completes 30 min AI voice interview.", getPipelineStepHref(8), "Interviews"),
      9: locked("Pass or reject after AI interview scores.", getPipelineStepHref(9), "AI Review"),
      10: locked("Schedule human panel + interviewer briefings.", getPipelineStepHref(10), "Human Panel"),
      11: locked("Mark human panel complete after the round.", getPipelineStepHref(11), "Panel Complete"),
      12: locked("Send offer or rejection email to candidate.", getPipelineStepHref(12), "Final Decision"),
    };
  }, [
    isRecruiter, title, experiencePreset, experienceLevel, employmentType, department,
    loading, pipelineMode, showManualJd, description, selected, hasDraft, isPublished,
    draftTitle, draftDescription, showJdEditor, applicants.length, deleteJob,
    effectiveJdHtml, jdHasEdits,
  ]);

  return (
    <div className="page-container">
      <div className="page-header min-w-0">
        <h1 className="page-title">Post Jobs</h1>
        <p className="page-subtitle">
          {pipelineProcessing
            ? `Agent 1 running — ${pipelineActiveDetail || "processing pipeline"}`
            : hiringPipelineStep === 3
              ? "Step 3 — Review draft and Approve & Post to Job Openings"
              : hiringPipelineStep === 4
                ? "Job published — candidates can apply on Job Openings"
                : "Step 1 — Agent reads org knowledge base and creates the JD (Groq)"}
        </p>
      </div>

      <GlassCard hover={false} className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="font-bold text-heading text-sm">
            Pipeline — you are at Step {hiringPipelineStep}
            {pipelineProcessing && (
              <span className="ml-2 text-xs font-normal text-accent animate-pulse">· auto-processing</span>
            )}
          </h3>
          {selected && (
            <span className="text-xs text-muted truncate max-w-full sm:max-w-[200px]">
              Active: <strong className="text-heading">{selected.title}</strong>
            </span>
          )}
        </div>

        <HiringPipelineFlow
          currentStep={hiringPipelineStep}
          expandable={isRecruiter}
          expandedStep={expandedStep}
          stepPanels={isRecruiter ? stepPanels : undefined}
          processing={pipelineProcessing}
          activeDetail={pipelineActiveDetail}
          candidate={!isRecruiter}
        />

        {isRecruiter && jobs.length > 0 && (
          <div className="mt-6 pt-4 border-t border-aqua/15">
            <h4 className="font-semibold text-heading mb-3 text-sm flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-aqua" />
              All Jobs — select to view in Step 2 / 3
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {jobs.map((j) => (
                <div
                  key={j.id}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${
                    selected?.id === j.id ? "border-aqua bg-aqua/10" : "border-transparent hover:bg-aqua/5"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void selectJob(j);
                      setExpandedStep(j.status === "draft" ? 2 : 4);
                    }}
                    className="flex-1 min-w-0 text-left p-1 rounded transition-colors"
                  >
                    <span className="font-medium text-heading">{j.title}</span>
                    {j.status === "draft" && (
                      <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        Draft
                      </span>
                    )}
                    {j.status === "open" && (
                      <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                        Live
                      </span>
                    )}
                    <span className="text-label ml-2">
                      ({jobSkills(j).length} skills
                      {j.applicant_count != null ? ` · ${j.applicant_count} applicants` : ""})
                    </span>
                  </button>
                  <Link
                    href={`/dashboard/jobs/${j.id}/view`}
                    onClick={(e) => e.stopPropagation()}
                    className="btn-secondary text-[11px] py-1.5 px-2.5 shrink-0 inline-flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3" />
                    View
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {isRecruiter && selected && (isPublished || hasDraft) && (
          <div className="mt-6 pt-4 border-t border-red-100">
            <div className="rounded-xl border border-red-100 bg-red-50/40 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-heading">Delete this job</p>
                <p className="text-xs text-muted mt-0.5">
                  {isPublished
                    ? "Removes the posting from Job Openings. Applications already received are kept."
                    : "Permanently discards this draft before publishing."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void deleteJob()}
                disabled={loading}
                className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                {isPublished ? "Delete posted job" : "Delete draft"}
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {!isRecruiter && selected && (
        <GlassCard>
          <h3 className="font-bold text-heading text-lg mb-2">{selected.title}</h3>
          <RichTextContent content={selected.description} variant="on-light" maxHeight="320px" />
        </GlassCard>
      )}
    </div>
  );
}
