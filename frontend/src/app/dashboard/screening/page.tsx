"use client";

import { useEffect, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { Upload, FileText, Loader2, Search, UserCheck } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import PageHeader from "@/components/ui/PageHeader";
import CandidateCard from "@/components/ui/CandidateCard";
import RichTextContent from "@/components/ui/RichTextContent";
import { screeningAPI, jobsAPI } from "@/lib/api";
import { normalizeCandidate } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/errors";

interface Job { id: number; title: string; description?: string; }
type Candidate = ReturnType<typeof normalizeCandidate>;

export default function ScreeningPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [lastUpload, setLastUpload] = useState<Record<string, unknown> | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [emailRequired, setEmailRequired] = useState(false);

  useEffect(() => {
    jobsAPI.list().then((r) => {
      setJobs(r.data);
      if (r.data.length > 0) setSelectedJob(r.data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedJob) loadCandidates(selectedJob);
  }, [selectedJob]);

  const loadCandidates = (jobId?: number) => {
    screeningAPI.candidates(jobId, true)
      .then((r) => setCandidates((r.data as Record<string, unknown>[]).map(normalizeCandidate)))
      .catch(() => {});
  };

  const onDrop = useCallback(async (files: File[]) => {
    if (!selectedJob) { toast.error("Select a job first"); return; }
    setLoading(true);
    setLastUpload(null);
    try {
      if (files.length === 1) {
        const { data } = await screeningAPI.upload(files[0], selectedJob, contactEmail);
        setLastUpload(data);
        setEmailRequired(false);
        toast.success(`Parsed ${data.name} — JD match ${Math.round(data.rankingScore || data.matchScore || 0)}%`);
      } else {
        const { data } = await screeningAPI.bulkUpload(files, selectedJob, contactEmail);
        if (data.total_failed > 0) {
          toast.error(`${data.total_failed} file(s) failed to parse`);
        }
        toast.success(`Processed ${data.total_processed} resume(s) against JD`);
      }
      loadCandidates(selectedJob);
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Screening failed. Ensure backend & ML service are running.");
      if (msg.toLowerCase().includes("no email")) setEmailRequired(true);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedJob, contactEmail]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    multiple: true,
  });

  const filtered = candidates.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  const selectedJobTitle = jobs.find((j) => j.id === selectedJob)?.title;

  return (
    <div className="page-container">
      <PageHeader
        title="AI Resume Screening"
        subtitle="Real resume parsing + JD analysis — no dummy data"
        icon={FileText}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <GlassCard className="lg:col-span-1">
          <h3 className="font-bold text-heading mb-4">Upload Resumes</h3>
          <select value={selectedJob || ""} onChange={(e) => setSelectedJob(Number(e.target.value))} className="input-field mb-2">
            <option value="">Select Job (JD)</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          {selectedJob && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-label mb-1">Selected JD preview</p>
              <RichTextContent
                content={jobs.find((j) => j.id === selectedJob)?.description || "JD loaded for screening"}
                variant="on-light"
                className="text-xs"
                maxHeight="120px"
              />
            </div>
          )}

          <label className="block text-xs font-semibold text-label mb-1">
            Candidate email {emailRequired ? "(required — not found in resume)" : "(optional if missing from resume)"}
          </label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="name@gmail.com"
            className={`input-field mb-4 ${emailRequired ? "border-red-400 ring-1 ring-red-300" : ""}`}
          />

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-all hover:scale-[1.01]
              ${isDragActive ? "border-aqua bg-aqua/5" : "border-aqua/30 hover:border-aqua"}`}
          >
            <input {...getInputProps()} />
            {loading ? <Loader2 className="w-10 h-10 text-accent mx-auto animate-spin" /> : <Upload className="w-10 h-10 text-accent mx-auto mb-3" />}
            <p className="text-sm text-body font-medium">{isDragActive ? "Drop resumes here" : "Drag & drop PDF/DOCX resumes"}</p>
            <p className="text-xs text-muted mt-1">Parsed against selected job description</p>
          </div>

          <div className="mt-4 space-y-2 text-xs text-muted">
            <p className="flex items-center gap-2"><FileText className="w-3 h-3 text-accent" /> Reads actual PDF/DOCX text</p>
            <p className="flex items-center gap-2"><FileText className="w-3 h-3 text-accent" /> Extracts name, email, skills, experience</p>
            <p className="flex items-center gap-2"><FileText className="w-3 h-3 text-accent" /> Scores vs job description + skills</p>
          </div>
        </GlassCard>

        <div className="lg:col-span-2 space-y-4">
          {lastUpload && (
            <GlassCard hover={false} className="border border-aqua/30">
              <h4 className="font-bold text-heading mb-2 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-accent" /> Latest Upload — Parsed from Resume
              </h4>
              <p className="text-sm text-heading font-medium">{String(lastUpload.name)} · {String(lastUpload.email)}</p>
              <p className="text-xs text-muted mb-2">
                JD: {selectedJobTitle} · Score: {Math.round(Number(lastUpload.rankingScore || lastUpload.matchScore || 0))}%
              </p>
              {(lastUpload.jd_fit_summary as string) && (
                <RichTextContent content={String(lastUpload.jd_fit_summary)} variant="on-light" className="text-sm" />
              )}
            </GlassCard>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search uploaded candidates..." className="input-field pl-10" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <CandidateCard
                  {...c}
                  missingSkills={c.missing_skills}
                  aiScore={c.ai_score}
                  rank={i + 1}
                  jdFitSummary={c.jd_fit_summary}
                  recommendation={c.recommendation}
                />
              </motion.div>
            ))}
            {filtered.length === 0 && (
              <GlassCard className="sm:col-span-2 text-center py-10 sm:py-12" hover={false}>
                <FileText className="w-12 h-12 text-accent/30 mx-auto mb-4" />
                <p className="text-muted">
                  No uploaded resumes yet. Upload a PDF/DOCX to parse real candidate data.
                </p>
              </GlassCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
