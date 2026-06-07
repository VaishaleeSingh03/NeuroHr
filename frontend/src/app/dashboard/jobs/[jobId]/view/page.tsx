"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import GlassCard from "@/components/ui/GlassCard";
import JdViewDocument from "@/components/hiring/JdViewDocument";
import { jobsAPI } from "@/lib/api";
import { getLiveJd, getLiveJdTitle, subscribeLiveJd } from "@/lib/jdLiveStorage";
import { getRichHtml } from "@/components/ui/RichTextEditor";
import { getPlainText } from "@/lib/richTextUtils";
import type { JdJson } from "@/lib/jdFormat";

interface JobView {
  id: number;
  title: string;
  description: string;
  experience_level?: string;
  department?: string;
  employment_type?: string;
  status?: string;
  jd_json?: JdJson | null;
}

function normalizeHtml(stored: string) {
  return getPlainText(stored).trim();
}

export default function ViewJdPage() {
  const params = useParams();
  const jobId = Number(params.jobId);
  const [job, setJob] = useState<JobView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayHtml, setDisplayHtml] = useState("");
  const [displayTitle, setDisplayTitle] = useState("");
  const [isLivePreview, setIsLivePreview] = useState(false);

  const applyLiveOverlay = useCallback((base: JobView) => {
    const liveHtml = getLiveJd(jobId);
    const liveTitle = getLiveJdTitle(jobId);
    const savedPlain = normalizeHtml(base.description);
    const livePlain = liveHtml ? normalizeHtml(liveHtml) : "";

    const html = liveHtml && livePlain !== savedPlain ? liveHtml : base.description;
    const title = liveTitle?.trim() && liveTitle !== base.title ? liveTitle : base.title;

    setDisplayHtml(html);
    setDisplayTitle(title);
    setIsLivePreview(Boolean(liveHtml && livePlain !== savedPlain) || Boolean(liveTitle && liveTitle !== base.title));
  }, [jobId]);

  const loadJob = useCallback(async () => {
    if (!jobId || Number.isNaN(jobId)) {
      setError("Invalid job id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await jobsAPI.get(jobId);
      const row: JobView = {
        id: data.id,
        title: data.title,
        description: data.description || "",
        experience_level: data.experience_level,
        department: data.department,
        employment_type: data.employment_type,
        status: data.status,
        jd_json: data.jd_json,
      };
      setJob(row);
      applyLiveOverlay(row);
    } catch {
      setError("Could not load this job description.");
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [jobId, applyLiveOverlay]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  useEffect(() => {
    if (!job) return;
    const unsub = subscribeLiveJd(jobId, ({ html, title }) => {
      setDisplayHtml(html);
      if (title) setDisplayTitle(title);
      const savedPlain = normalizeHtml(job.description);
      const livePlain = normalizeHtml(html);
      setIsLivePreview(
        livePlain !== savedPlain || Boolean(title && title !== job.title),
      );
    });

    const poll = setInterval(() => {
      applyLiveOverlay(job);
    }, 800);

    return () => {
      unsub();
      clearInterval(poll);
    };
  }, [job, jobId, applyLiveOverlay]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-muted gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-aqua" />
        Loading job description…
      </div>
    );
  }

  if (error || !job) {
    return (
      <GlassCard className="text-center py-16" hover={false}>
        <p className="text-red-600 mb-4">{error || "Job not found"}</p>
        <Link href="/dashboard/jobs" className="btn-secondary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Post Jobs
        </Link>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto min-w-0 px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center gap-2 text-sm font-medium text-body hover:text-heading transition-colors"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Back to pipeline
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadJob()}
            className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <a
            href={`/dashboard/jobs/${jobId}/view`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            New tab
          </a>
        </div>
      </div>

      {isLivePreview && (
        <p className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          Showing unsaved edits from the editor — updates in real time as you change the JD on Post Jobs.
        </p>
      )}

      <GlassCard hover={false} className="p-5 sm:p-8 lg:p-10 min-w-0">
        <JdViewDocument
          title={displayTitle || job.title}
          description={getRichHtml(displayHtml || job.description)}
          jdJson={isLivePreview ? null : job.jd_json}
          department={job.department}
          experienceLevel={job.experience_level}
          employmentType={job.employment_type}
          status={job.status}
          isLivePreview={isLivePreview}
          orgName={process.env.NEXT_PUBLIC_ORG_NAME || "XYZ"}
        />
      </GlassCard>
    </div>
  );
}
