"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePipelineHashScroll } from "@/hooks/usePipelineHashScroll";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, Mic, MicOff, Bot, Loader2, Clock, Volume2,
  CheckCircle, AlertCircle, Play, Square,
} from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import ScoreIndicator from "@/components/ui/ScoreIndicator";
import RichTextEditor, { getPlainText } from "@/components/ui/RichTextEditor";
import RichTextContent from "@/components/ui/RichTextContent";
import { toEditorHtml } from "@/lib/tiptapContent";
import { interviewsAPI, screeningAPI, jobsAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { normalizeRole, isSchedulerRole, isCandidateRole } from "@/lib/roleAccess";
import {
  canStartInterview, formatDeadline, formatTimeRemaining, getInterviewDeadline,
  defaultDeadlineLocal, minDeadlineLocal, isInterviewExpired,
  dedupeInterviewsByRole, hasBlockingInterviewForRole, interviewAttemptUsed,
} from "@/lib/interviewUtils";
import { scheduleInterviewWithDeadline } from "@/lib/interviewSchedule";
import { getApiErrorMessage } from "@/lib/errors";
import { useVoiceInterview } from "@/hooks/useVoiceInterview";
import ZaraAvatar from "@/components/interview/ZaraAvatar";
import RejectedNotice from "@/components/ui/RejectedNotice";
import { REJECTED_CANDIDATE_MESSAGE } from "@/lib/applicationStatus";
import { dispatchNotificationsRefresh } from "@/lib/notificationEvents";

interface Question {
  id: number;
  question: string;
  text?: string;
  type: string;
  category?: string;
  skill?: string;
  skill_being_tested?: string;
  difficulty?: string;
  max_time_seconds?: number;
  time_limit_seconds?: number;
}
interface Candidate { id: number; name: string; email?: string; jobId?: number; }
interface Job { id: number; title: string; description?: string; }
interface InterviewResult {
  technical_score: number; communication_score: number; confidence_score: number;
  jd_alignment_score?: number; problem_solving_score?: number;
  culture_fit_score?: number; experience_depth_score?: number;
  screening_score?: number; interview_score?: number; composite_score?: number;
  shortlist_verdict?: string;
  verdict?: string; top_strengths?: string[]; concerns?: string[];
  evaluation_method?: string; job_title?: string;
  voice_score?: number; final_score: number; overall_score?: number;
  recommendation?: string; ai_feedback?: string;
  per_answer_feedback?: {
    question: string; answer: string; feedback: string;
    technical_score: number; jd_alignment_score?: number; communication_score?: number;
  }[];
}

type Phase = "setup" | "interview" | "analyzing" | "results";
type ConversationEntry = { speaker: "Interviewer" | "You"; text: string };

const TOPIC_LABELS = ["Technical", "Problem Solving", "Communication", "Culture Fit", "Experience"];

function getActiveTopicIndex(qIndex: number, total: number) {
  if (total <= 0) return 0;
  const bucket = Math.max(1, Math.ceil(total / TOPIC_LABELS.length));
  return Math.min(Math.floor(qIndex / bucket), TOPIC_LABELS.length - 1);
}

export default function InterviewsPage() {
  const { user } = useAuth();
  const voice = useVoiceInterview();
  const [phase, setPhase] = useState<Phase>("setup");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [jobInfo, setJobInfo] = useState<{ title: string; description?: string } | null>(null);
  const [interviewId, setInterviewId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [qaLog, setQaLog] = useState<{ question: string; answer: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<InterviewResult | null>(null);
  const [videoAnalysis, setVideoAnalysis] = useState<Record<string, unknown>>({});
  const [pastInterviews, setPastInterviews] = useState<object[]>([]);
  const [scheduledAt, setScheduledAt] = useState(defaultDeadlineLocal);
  const [now, setNow] = useState(Date.now());
  const [selectedInterviewId, setSelectedInterviewId] = useState<number | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [answerHtml, setAnswerHtml] = useState("");
  const [zaraCaption, setZaraCaption] = useState("");
  const [conversationLog, setConversationLog] = useState<ConversationEntry[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisInterval = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const finishingRef = useRef(false);

  const role = normalizeRole(user?.role);
  const isScheduler = isSchedulerRole(role);
  const isCandidate = isCandidateRole(role);
  const interviewRows = pastInterviews as Record<string, unknown>[];
  const roleAlreadyScheduled = isScheduler && selectedCandidate && selectedJob
    ? hasBlockingInterviewForRole(interviewRows, selectedCandidate, selectedJob)
    : false;

  const loadInterviews = useCallback(() => {
    const apply = (rows: object[]) =>
      setPastInterviews(dedupeInterviewsByRole(rows as Record<string, unknown>[]));
    if (isCandidate) {
      interviewsAPI.my().then((r) => apply(r.data || [])).catch(() => setPastInterviews([]));
    } else if (user) {
      interviewsAPI.list().then((r) => apply(r.data || [])).catch(() => setPastInterviews([]));
    }
  }, [isCandidate, user]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    jobsAPI.list().then((r) => {
      setJobs(r.data);
      if (r.data.length === 1) setSelectedJob(r.data[0].id);
    }).catch(() => {});
    if (isScheduler) {
      screeningAPI.candidates(undefined, true).then((r) => setCandidates(r.data)).catch(() => {});
    }
    loadInterviews();
    const poll = setInterval(loadInterviews, 20000);
    const onFocus = () => loadInterviews();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, isScheduler, loadInterviews]);

  useEffect(() => {
    if (!selectedCandidate) return;
    const candidate = candidates.find((c) => c.id === selectedCandidate);
    if (candidate?.jobId) setSelectedJob(candidate.jobId);
  }, [selectedCandidate, candidates]);

  useEffect(() => {
    const plain = voice.transcript.trim();
    if (getPlainText(answerHtml) !== plain) {
      setAnswerHtml(toEditorHtml(plain));
    }
  }, [voice.transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === "interview" && voice.mediaReady) {
      void voice.attachPreview();
    }
  }, [phase, voice.mediaReady, voice.attachPreview]);

  const captureFrame = useCallback(async () => {
    if (!voice.videoRef.current || !canvasRef.current || !interviewId) return;
    const v = voice.videoRef.current;
    if (v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) return;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    const image = c.toDataURL("image/jpeg", 0.7);
    try {
      const { data } = await interviewsAPI.analyzeFrame(interviewId, image);
      setVideoAnalysis(data);
    } catch { /* silent */ }
  }, [interviewId, voice.videoRef]);

  const speakQuestion = useCallback(async (text: string, logConversation = true) => {
    await voice.speakWithCaption(text, setZaraCaption);
    if (logConversation) {
      setConversationLog((prev) => [...prev, { speaker: "Interviewer", text }]);
    }
  }, [voice]);

  const askQuestion = useCallback(async (index: number, qs: Question[]) => {
    if (index >= qs.length) return;
    const q = qs[index];
    const text = (q.question || q.text || "").trim();
    if (!text) {
      voice.startListening();
      return;
    }
    await speakQuestion(text);
    voice.startListening();
  }, [voice, speakQuestion]);

  const finishInterview = useCallback(async () => {
    if (finishingRef.current || !interviewId) return;
    finishingRef.current = true;

    if (analysisInterval.current) clearInterval(analysisInterval.current);
    voice.stopListening();

    setPhase("analyzing");
    setLoading(true);

    const blob = await voice.stopRecording();
    voice.stopMedia();
    const duration = 30 * 60 - voice.timeLeft;

    try {
      if (blob) {
        await interviewsAPI.uploadRecording(interviewId, blob, duration);
      }

      const fullTranscript = qaLog.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n");
      await interviewsAPI.submit(interviewId, {
        answers: qaLog,
        transcript: fullTranscript,
        video_analysis: videoAnalysis,
      });

      setAnalysisProgress(10);
      let attempts = 0;
      const poll = async () => {
        attempts++;
        setAnalysisProgress(Math.min(95, 10 + attempts * 8));
        try {
          const { data } = await interviewsAPI.getStatus(interviewId);
          if (data.analysis_status === "completed") {
            setResults(data);
            setPhase("results");
            setLoading(false);
            loadInterviews();
            const interviewScore = Math.round(data.interview_score || data.overall_score || 0);
            const role = data.job_title || jobInfo?.title || "this role";
            const hrRejected = data.application_status === "rejected";
            if (hrRejected) {
              toast.error(REJECTED_CANDIDATE_MESSAGE, { duration: 10000 });
              await voice.speak(
                `Your interview for ${role} is complete. Your application was not selected to move forward.`
              );
            } else {
              toast.success(`Interview complete — score ${interviewScore}/100. HR will review within 2–3 days.`);
              await voice.speak(
                `Your interview for ${role} is complete. Score: ${interviewScore} out of 100. Verdict: ${data.verdict || "under review"}. Our hiring team will review your results shortly.`
              );
            }
            dispatchNotificationsRefresh();
            return;
          }
          if (data.analysis_status === "failed") {
            toast.error("Analysis failed. Your recruiter has been notified.");
            setPhase("setup");
            setLoading(false);
            loadInterviews();
            return;
          }
        } catch { /* retry */ }
        if (attempts < 40) {
          pollRef.current = setTimeout(poll, 3000);
        } else {
          toast.error("Analysis timed out");
          setPhase("setup");
          setLoading(false);
        }
      };
      pollRef.current = setTimeout(poll, 3000);
      loadInterviews();
    } catch {
      toast.error("Failed to submit interview");
      setPhase("setup");
      setLoading(false);
    }
    finishingRef.current = false;
  }, [interviewId, qaLog, videoAnalysis, voice, jobInfo, loadInterviews]);

  const scheduleInterview = async () => {
    if (!selectedJob || !selectedCandidate) {
      toast.error("Select a candidate and job to schedule");
      return;
    }
    setLoading(true);
    try {
      const { deadlineIso } = await scheduleInterviewWithDeadline({
        candidateId: selectedCandidate,
        jobId: selectedJob,
        deadlineLocal: scheduledAt,
      });
      toast.success(`Interview scheduled — complete before ${new Date(deadlineIso).toLocaleString()}`);
      setScheduledAt(defaultDeadlineLocal());
      loadInterviews();
    } catch {
      /* toast shown in scheduleInterviewWithDeadline */
    } finally {
      setLoading(false);
    }
  };

  const startInterview = async (interviewId?: number) => {
    const id = interviewId ?? selectedInterviewId;
    if (!id) {
      toast.error("Select a scheduled interview to begin");
      return;
    }
    setLoading(true);
    try {
      const { data } = await interviewsAPI.start(id);
      setInterviewId(data.id);
      setQuestions(data.questions || []);
      setJobInfo(
        data.job
          ? { title: data.job.title, description: data.job.description }
          : { title: data.jobTitle || jobs.find((j) => j.id === selectedJob)?.title || "Selected Role" }
      );
      setCurrentQ(0);
      setQaLog([]);
      setResults(null);
      setVideoAnalysis({});
      setZaraCaption("");
      setConversationLog([]);
      finishingRef.current = false;

      setPhase("interview");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const stream = await voice.initMedia();
      await voice.attachPreview();
      voice.startRecording(stream);
      voice.startTimer(() => finishInterview());

      analysisInterval.current = setInterval(captureFrame, 4000);

      await askQuestion(0, data.questions || []);
      toast.success("Interview started — camera and microphone active");
    } catch (err: unknown) {
      voice.stopMedia();
      toast.error(getApiErrorMessage(err, "Failed to start. Allow camera/microphone access and try again."));
      setPhase("setup");
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (voice.isSpeaking || loading) return;
    setLoading(true);
    try {
      const { text, durationSeconds } = await voice.stopListening();
      const answer = (text || voice.transcript).trim();

      if (!answer) {
        toast.error("No answer recorded. Speak clearly or type your answer below.");
        voice.startListening();
        return;
      }

      const q = questions[currentQ];
      const entry = { question: q?.question || q?.text || "", answer };
      const newLog = [...qaLog, entry];
      setQaLog(newLog);
      setConversationLog((prev) => [...prev, { speaker: "You", text: answer }]);

      if (interviewId) {
        try {
          await interviewsAPI.saveAnswer(interviewId, {
            question: entry.question,
            answer: entry.answer,
            question_index: currentQ,
            duration_seconds: durationSeconds,
          });
        } catch {
          toast.error("Could not save answer to server — saved locally for this session");
        }
      }

      const next = currentQ + 1;
      if (next < questions.length && voice.timeLeft > 30) {
        setCurrentQ(next);
        voice.setTranscript("");
        setAnswerHtml("");
        await askQuestion(next, questions);
      } else {
        await finishInterview();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => {
    if (analysisInterval.current) clearInterval(analysisInterval.current);
    if (pollRef.current) clearTimeout(pollRef.current);
    voice.stopMedia();
  }, []);

  usePipelineHashScroll();

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">{isScheduler ? "Interview Schedule" : "My AI Interview"}</h1>
        <p className="page-subtitle">
          {isScheduler
            ? "Set interview deadline — candidate must complete before that date & time"
            : "Complete your AI interview before the deadline set by your recruiter"}
        </p>
      </div>

      {phase === "setup" && (
        <div id="pipeline-step-8" className="scroll-mt-24">
        <GlassCard hover={false}>
          <h3 className="font-bold text-heading mb-3">{isScheduler ? "All Scheduled Interviews" : "My Interviews"}</h3>
          {pastInterviews.length === 0 && isCandidate && (
            <p className="text-sm text-muted mb-3">No interviews yet. When a recruiter schedules one for you, it will appear here.</p>
          )}
          <div className="space-y-2">
            {(pastInterviews as Record<string, unknown>[]).map((i) => {
              const expired = isInterviewExpired(i);
              const deadline = getInterviewDeadline(i);
              const msLeft = deadline ? deadline.getTime() - now : null;
              const recommendation = String(i.recommendation || "");
              const finalScore = Number(i.finalScore ?? i.final_score ?? 0);
              const rejected = String(i.application_status || i.applicationStatus) === "rejected";
              return (
              <div
                key={String(i.id)}
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-xl text-sm ${
                  rejected ? "bg-red-50 border border-red-200" : "bg-cream/50"
                }`}
              >
                <div>
                  <p className="font-medium text-heading">
                    {String(i.jobTitle || i.job_title || "Interview")} — #{String(i.id)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    {isScheduler && Boolean(i.candidate_name || i.candidateName) && (
                      <span className="text-xs text-muted">{String(i.candidate_name || i.candidateName)}</span>
                    )}
                    <span className="text-xs text-muted capitalize">{String(i.status)}</span>
                    {rejected && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                        Rejected
                      </span>
                    )}
                    {recommendation && String(i.status) === "completed" && !rejected && (
                      <span className="text-[10px] font-medium text-accent">{recommendation}</span>
                    )}
                  </div>
                  <p className="text-xs text-accent mt-0.5">
                    Deadline: {formatDeadline(i)}
                    {msLeft != null && !expired && i.status === "scheduled" && (
                      <span className="text-body"> · {formatTimeRemaining(msLeft)}</span>
                    )}
                    {expired && <span className="text-red-600 font-medium"> · Expired</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {Boolean(i.finalScore || i.final_score) && (
                    <span className={`font-bold ${rejected ? "text-red-700" : "text-accent"}`}>
                      {Math.round(Number(i.finalScore || i.final_score))}%
                    </span>
                  )}
                  {isCandidate && canStartInterview(i) && (
                    <button
                      onClick={() => { setSelectedInterviewId(Number(i.id)); startInterview(Number(i.id)); }}
                      disabled={loading}
                      className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
                    >
                      {i.status === "in_progress" ? "Resume Interview" : "Join Interview"}
                    </button>
                  )}
                  {isCandidate && interviewAttemptUsed(i) && !rejected && (
                    <span className="text-xs text-muted font-medium">Submitted — one attempt only</span>
                  )}
                  {isCandidate && rejected && (
                    <span className="text-xs text-red-700 font-semibold">Application rejected</span>
                  )}
                  {isScheduler && rejected && (
                    <span className="text-xs text-red-700 font-semibold">Auto-rejected</span>
                  )}
                </div>
              </div>
            );})}
            {pastInterviews.length === 0 && isScheduler && (
              <p className="text-sm text-muted text-center py-4">No interviews scheduled yet.</p>
            )}
          </div>
        </GlassCard>
        </div>
      )}

      <AnimatePresence mode="wait">
        {phase === "setup" && isScheduler && (
          <motion.div key="setup-scheduler" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GlassCard className="max-w-lg mx-auto" hover={false}>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-aqua/15 rounded-xl"><Bot className="w-8 h-8 text-accent" /></div>
                <div>
                  <h3 className="font-bold text-heading">Schedule Interview</h3>
                  <p className="text-sm text-muted">Recruiter / manager schedules · candidate takes the interview</p>
                </div>
              </div>
              <label className="text-xs text-label block mb-1">Candidate</label>
              <select
                value={selectedCandidate || ""}
                onChange={(e) => setSelectedCandidate(Number(e.target.value))}
                className="input-field mb-4"
              >
                <option value="">Select Candidate</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email || "no email"})</option>)}
              </select>
              <label className="text-xs text-label block mb-1">Job (JD drives questions)</label>
              <select
                value={selectedJob || ""}
                onChange={(e) => setSelectedJob(Number(e.target.value))}
                className="input-field mb-4"
              >
                <option value="">Select Job</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
              <label className="text-xs text-label block mb-1">Interview deadline (complete before)</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                min={minDeadlineLocal()}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="input-field mb-2"
              />
              <p className="text-xs text-muted mb-4">Candidate may start the interview anytime before this deadline.</p>
              {roleAlreadyScheduled && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                  An interview is already scheduled or completed for this candidate and role. Only one interview per role is allowed.
                </p>
              )}
              <button
                onClick={scheduleInterview}
                disabled={loading || !selectedJob || !selectedCandidate || !scheduledAt || roleAlreadyScheduled}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Clock className="w-5 h-5" /> Set deadline & schedule</>}
              </button>
            </GlassCard>
          </motion.div>
        )}

        {phase === "setup" && isCandidate && (
          <motion.div key="setup-candidate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GlassCard className="max-w-lg mx-auto" hover={false}>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-aqua/15 rounded-xl"><Bot className="w-8 h-8 text-accent" /></div>
                <div>
                  <h3 className="font-bold text-heading">Your Scheduled Interview</h3>
                  <p className="text-sm text-muted">30 min · AI voice interview · Camera + Mic · Voice answers</p>
                </div>
              </div>
              <ul className="text-sm text-body space-y-2 mb-6">
                <li className="flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Complete before the deadline set by recruiter</li>
                <li className="flex items-center gap-2"><Volume2 className="w-4 h-4 text-accent" /> Questions tailored to the job description</li>
                <li className="flex items-center gap-2"><Mic className="w-4 h-4 text-accent" /> Speak clearly — answers are scored vs the JD</li>
                <li className="flex items-center gap-2"><Video className="w-4 h-4 text-accent" /> Camera required for the session</li>
              </ul>
              {(pastInterviews as Record<string, unknown>[]).filter((i) => canStartInterview(i)).length === 0 ? (
                <p className="text-sm text-muted text-center py-4">
                  {(pastInterviews as Record<string, unknown>[]).some((i) => interviewAttemptUsed(i))
                    ? "You have already completed your interview for this role. Your recruiter will review the results."
                    : "No interview scheduled yet. Your recruiter will schedule one for you."}
                </p>
              ) : (
                <>
                  <label className="text-xs text-label block mb-1">Select interview to join</label>
                  <select
                    value={selectedInterviewId || ""}
                    onChange={(e) => setSelectedInterviewId(Number(e.target.value))}
                    className="input-field mb-4"
                  >
                    <option value="">Choose interview</option>
                    {(pastInterviews as Record<string, unknown>[])
                      .filter((i) => canStartInterview(i))
                      .map((i) => (
                        <option key={String(i.id)} value={Number(i.id)} disabled={!canStartInterview(i)}>
                          {String(i.jobTitle || i.job_title)} — deadline {formatDeadline(i)}
                          {i.status === "in_progress" ? " (resume)" : ""}
                          {isInterviewExpired(i) ? " (expired)" : ""}
                        </option>
                      ))}
                  </select>
                  {selectedInterviewId && (() => {
                    const sel = (pastInterviews as Record<string, unknown>[]).find((i) => Number(i.id) === selectedInterviewId);
                    if (!sel) return null;
                    const deadline = getInterviewDeadline(sel);
                    const msLeft = deadline ? deadline.getTime() - now : null;
                    return (
                      <p className={`text-sm mb-4 ${isInterviewExpired(sel) ? "text-red-600" : "text-body"}`}>
                        {isInterviewExpired(sel)
                          ? "This interview deadline has passed. Contact your recruiter."
                          : msLeft != null
                            ? `Time remaining: ${formatTimeRemaining(msLeft)}`
                            : ""}
                      </p>
                    );
                  })()}
                  <button
                    onClick={() => startInterview()}
                    disabled={loading || !selectedInterviewId || !(pastInterviews as Record<string, unknown>[]).some(
                      (i) => Number(i.id) === selectedInterviewId && canStartInterview(i)
                    )}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Play className="w-5 h-5" /> Join Interview</>}
                  </button>
                </>
              )}
            </GlassCard>
          </motion.div>
        )}

        {phase === "setup" && !isScheduler && !isCandidate && (
          <GlassCard className="max-w-lg mx-auto text-center py-8" hover={false}>
            <p className="text-muted">View scheduled interviews above. Only candidates take live interviews.</p>
          </GlassCard>
        )}

        {phase === "interview" && (
          <motion.div key="interview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full min-w-0 space-y-3 sm:space-y-4">
            <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <span className={`flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3 py-1 rounded-full shrink-0 ${voice.timeLeft < 60 ? "bg-red-100 text-red-700" : "bg-cream text-heading"}`}>
                  <Clock className="w-4 h-4 shrink-0" /> {voice.formatTime(voice.timeLeft)}
                </span>
                {jobInfo?.title && (
                  <span className="text-xs text-accent font-medium truncate max-w-full sm:max-w-[220px]">{jobInfo.title}</span>
                )}
                {voice.recording && (
                  <span className="flex items-center gap-1 text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full shrink-0">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> REC
                  </span>
                )}
              </div>
              <p className="text-xs text-muted font-medium shrink-0">
                Question {currentQ + 1} of {questions.length || "—"}
              </p>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
              {TOPIC_LABELS.map((label, i) => {
                const activeIdx = getActiveTopicIndex(currentQ, questions.length);
                const cls = i < activeIdx
                  ? "bg-green-100 text-green-800 border-green-200"
                  : i === activeIdx
                    ? "bg-aqua/15 text-teal-dark border-aqua/25"
                    : "bg-cream/60 text-muted border-transparent";
                return (
                  <span
                    key={label}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-medium border ${cls}`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>

            <div className="interview-layout">
              <GlassCard className="interview-panel-main p-3 sm:p-4 lg:p-5" hover={false}>
                <ZaraAvatar
                  isSpeaking={voice.isSpeaking}
                  isListening={voice.isListening}
                  caption={zaraCaption}
                  statusText={
                    voice.isSpeaking
                      ? "Reading question…"
                      : voice.isListening
                        ? "Listening to your answer…"
                        : loading
                          ? "Processing…"
                          : undefined
                  }
                />

                <div className="mt-4 max-h-40 sm:max-h-48 overflow-y-auto space-y-2 pr-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted font-semibold mb-2">Conversation</p>
                  {conversationLog.length === 0 ? (
                    <p className="text-xs text-muted italic">Interview questions will appear here.</p>
                  ) : (
                    conversationLog.map((entry, i) => (
                      <div
                        key={i}
                        className={`rounded-xl px-3 py-2.5 text-xs sm:text-sm leading-relaxed border-l-[3px] ${
                          entry.speaker === "Interviewer"
                            ? "bg-aqua/10 border-aqua text-teal-dark"
                            : "bg-green-50 border-green-500 text-green-900"
                        }`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mb-1">
                          {entry.speaker === "Interviewer" ? "Question" : "You"}
                        </p>
                        {entry.speaker === "You" ? (
                          <RichTextContent content={entry.text} variant="on-light" className="text-xs sm:text-sm" maxHeight="80px" />
                        ) : (
                          <p>{entry.text}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4 pt-4 border-t border-aqua/10">
                  <button
                    onClick={submitAnswer}
                    disabled={loading || voice.isSpeaking || !voice.transcript.trim()}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 min-w-0"
                  >
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {currentQ < questions.length - 1 ? "Submit & Next" : "Finish Interview"}
                    </span>
                  </button>
                  {!voice.isListening && !voice.isSpeaking && (
                    <button
                      onClick={() => voice.startListening()}
                      className="btn-secondary flex items-center justify-center gap-2 shrink-0"
                    >
                      <Mic className="w-4 h-4" /> Re-listen
                    </button>
                  )}
                  <button
                    onClick={finishInterview}
                    className="btn-secondary flex items-center justify-center gap-2 shrink-0"
                  >
                    <Square className="w-4 h-4" /> End Early
                  </button>
                </div>
              </GlassCard>

              <div className="interview-panel-side">
                <GlassCard className="p-3 sm:p-4 min-w-0" hover={false}>
                  <h4 className="font-bold text-heading mb-3 flex items-center gap-2 text-sm sm:text-base">
                    <Video className="w-5 h-5 text-accent shrink-0" /> Your Camera
                  </h4>
                  <div className="interview-webcam">
                    <video
                      ref={voice.bindVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover bg-black"
                      style={{ transform: "scaleX(-1)" }}
                      onLoadedMetadata={() => { void voice.attachPreview(); }}
                    />
                    {!voice.previewReady && !voice.cameraError && (
                      <div className="absolute inset-0 flex items-center justify-center text-inverse/80 text-xs sm:text-sm p-4 text-center">
                        Starting camera…
                      </div>
                    )}
                    {voice.cameraError && (
                      <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-red-200 text-xs">
                        {voice.cameraError}
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <span className="bg-red-600/90 text-inverse text-[10px] sm:text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> REC
                      </span>
                    </div>
                    <span className="absolute bottom-2 left-2 text-[10px] text-inverse bg-black/50 px-2 py-0.5 rounded-md backdrop-blur-sm">
                      You
                    </span>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </GlassCard>

                <GlassCard className="p-3 sm:p-4 min-w-0 flex-1" hover={false}>
                  <p className="text-xs text-label mb-2 flex items-center gap-1.5">
                    {voice.isListening ? (
                      <Mic className="w-3.5 h-3.5 text-accent animate-pulse shrink-0" />
                    ) : (
                      <MicOff className="w-3.5 h-3.5 shrink-0" />
                    )}
                    {voice.isListening ? "Speak now — your answer appears here" : "Your answer (edit if needed)"}
                  </p>
                  {voice.isListening && voice.transcript.trim() && (
                    <p className="text-xs sm:text-sm text-green-700 italic mb-2 min-h-[1.25rem] break-words">
                      {voice.transcript}
                    </p>
                  )}
                  <RichTextEditor
                    value={answerHtml}
                    onChange={(html) => {
                      setAnswerHtml(html);
                      voice.setTranscript(getPlainText(html));
                    }}
                    placeholder={voice.isListening ? "Listening…" : "Type or speak your answer…"}
                    minHeight="100px"
                  />
                  {voice.speechError && (
                    <p className="text-xs text-orange-600 mt-2 flex items-center gap-1 break-words">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {voice.speechError}
                    </p>
                  )}
                  {!voice.speechSupported && (
                    <p className="text-xs text-muted mt-2">Voice-to-text unavailable — type your answer above</p>
                  )}
                </GlassCard>
              </div>
            </div>
          </motion.div>
        )}

        {phase === "analyzing" && (
          <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard className="text-center py-12 max-w-lg mx-auto" hover={false}>
              <Loader2 className="w-16 h-16 text-accent mx-auto animate-spin mb-6" />
              <h2 className="text-xl font-bold text-heading mb-2">AI Analyzing Your Interview</h2>
              <p className="text-muted mb-6">
                Groq is scoring your answers against the job description — technical knowledge, problem solving,
                communication, and role fit for {jobInfo?.title || "your role"}. Results typically ready in 2–3 minutes.
              </p>
              <div className="w-full bg-cream rounded-full h-3 mb-2">
                <motion.div
                  className="bg-aqua h-3 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${analysisProgress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <p className="text-sm text-accent font-medium">{analysisProgress}% complete</p>
            </GlassCard>
          </motion.div>
        )}

        {phase === "results" && results && (() => {
          const resultsRejected = (results as InterviewResult & { application_status?: string }).application_status === "rejected";
          return (
          <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {resultsRejected && isCandidate && (
              <RejectedNotice audience="candidate" />
            )}
            {resultsRejected && isScheduler && (
              <RejectedNotice audience="recruiter" />
            )}
            <GlassCard className={`text-center py-8 ${resultsRejected ? "border border-red-200" : ""}`} hover={false}>
              {resultsRejected ? (
                <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
              ) : (
                <CheckCircle className="w-12 h-12 text-accent mx-auto mb-4" />
              )}
              <h2 className="text-2xl font-bold text-heading mb-1">
                {resultsRejected ? "Interview Complete — Not Selected" : "Interview Results — HR Screening Pending"}
              </h2>
              {(results.job_title || jobInfo?.title) && (
                <p className="text-sm text-muted mb-2">Role: {results.job_title || jobInfo?.title}</p>
              )}
              <p className={`text-lg font-semibold mb-2 ${
                resultsRejected ? "text-red-700"
                  : results.verdict === "Strong Hire" ? "text-accent" : "text-heading"
              }`}>
                {results.verdict || "Under review"}
              </p>
              {results.shortlist_verdict && (
                <p className="text-sm text-accent font-medium mb-2">{results.shortlist_verdict}</p>
              )}
              {results.composite_score != null && results.screening_score != null && (
                <p className="text-xs text-muted mb-4">
                  Composite: {Math.round(results.composite_score)}% (80% screening {Math.round(results.screening_score)}% + 20% interview {Math.round(results.interview_score || results.overall_score || 0)}%)
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6 mb-4">
                <ScoreIndicator score={results.technical_score} label="Technical (35%)" size="md" />
                <ScoreIndicator score={results.problem_solving_score || results.jd_alignment_score || results.technical_score} label="Problem Solving (25%)" size="md" />
                <ScoreIndicator score={results.communication_score} label="Communication (20%)" size="md" />
                <ScoreIndicator score={results.culture_fit_score || results.confidence_score} label="Culture Fit (10%)" size="md" />
                <ScoreIndicator score={results.experience_depth_score || results.confidence_score} label="Experience (10%)" size="md" />
              </div>
              <ScoreIndicator score={results.interview_score || results.overall_score || 0} label="Interview Score" size="lg" />
              {results.composite_score != null && (
                <p className="text-sm text-muted mt-2">
                  Composite score: <strong>{Math.round(results.composite_score)}%</strong>
                </p>
              )}
              {(results.top_strengths?.length ?? 0) > 0 && (
                <p className="text-sm text-body mt-4">
                  <strong>Strengths:</strong> {results.top_strengths!.join(", ")}
                </p>
              )}
              {(results.concerns?.length ?? 0) > 0 && (
                <p className="text-sm text-muted mt-2">
                  <strong>Concerns:</strong> {results.concerns!.join(", ")}
                </p>
              )}
            </GlassCard>

            {results.ai_feedback && (
              <GlassCard hover={false}>
                <h3 className="font-bold text-heading mb-3 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-accent" /> AI Feedback
                </h3>
                <RichTextContent content={results.ai_feedback} variant="on-light" />
              </GlassCard>
            )}

            {results.per_answer_feedback && results.per_answer_feedback.length > 0 && (
              <GlassCard hover={false}>
                <h3 className="font-bold text-heading mb-4">Per-Question Analysis (vs JD)</h3>
                <div className="space-y-4">
                  {results.per_answer_feedback.map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="bg-cream/50 rounded-xl p-4"
                    >
                      <p className="text-sm font-semibold text-heading">Q{i + 1}:</p>
                      <RichTextContent content={item.question} variant="on-light" className="text-sm font-semibold" />
                      {item.answer && (
                        <div className="mt-2 italic">
                          <RichTextContent content={item.answer} variant="on-light" className="text-sm" maxHeight="100px" />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 mt-3 text-xs">
                        <span className="text-accent font-bold">JD Fit: {Math.round(item.jd_alignment_score ?? item.technical_score)}%</span>
                        <span className="text-heading font-medium">Technical: {Math.round(item.technical_score)}%</span>
                        {item.communication_score != null && (
                          <span className="text-muted">Comm: {Math.round(item.communication_score)}%</span>
                        )}
                      </div>
                      <div className="mt-2">
                        <RichTextContent content={item.feedback} variant="on-light" className="text-xs" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </GlassCard>
            )}

            <button
              onClick={() => { setPhase("setup"); setResults(null); setInterviewId(null); finishingRef.current = false; }}
              className="btn-primary mx-auto block"
            >
              {resultsRejected ? "Back to Interviews" : "New Interview"}
            </button>
          </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
