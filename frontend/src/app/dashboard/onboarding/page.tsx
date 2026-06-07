"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, FileText, CheckSquare, Calendar } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import RichTextContent from "@/components/ui/RichTextContent";
import { onboardingAPI, screeningAPI } from "@/lib/api";

interface Candidate {
  id: number;
  name: string;
}

interface OnboardingPlan {
  id: number;
  candidate_id: number;
  offer_letter: string;
  joining_checklist: { task: string; due: string; status: string }[];
  day_30_plan: { title: string; goals: string[] };
  day_60_plan: { title: string; goals: string[] };
  day_90_plan: { title: string; goals: string[] };
  training_plan: { modules: { name: string; duration: string }[] };
}

export default function OnboardingPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("Engineering");
  const [startDate, setStartDate] = useState("");
  const [plan, setPlan] = useState<OnboardingPlan | null>(null);
  const [loading, setLoading] = useState(false);

  const [plans, setPlans] = useState<OnboardingPlan[]>([]);

  useEffect(() => {
    screeningAPI.candidates().then((r) => setCandidates(r.data)).catch(() => {});
    onboardingAPI.list().then((r) => setPlans(r.data)).catch(() => {});
  }, []);

  const loadPlan = async (id: number) => {
    const { data } = await onboardingAPI.get(id);
    setPlan(data);
  };

  const generate = async () => {
    if (!selectedId || !position) {
      toast.error("Select candidate and enter position");
      return;
    }
    setLoading(true);
    try {
      const { data } = await onboardingAPI.generate({
        candidate_id: selectedId,
        job_title: position,
        department,
        start_date: startDate || new Date().toISOString().split("T")[0],
      });
      setPlan(data);
      onboardingAPI.list().then((r) => setPlans(r.data)).catch(() => {});
      toast.success("Onboarding plan generated!");
    } catch {
      toast.error("Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header min-w-0">
        <h1 className="page-title">AI Onboarding System</h1>
        <p className="page-subtitle">Auto-generate offer letters, checklists, and 30/60/90 day plans</p>
      </div>

      <div className="split-layout">
        <GlassCard>
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-aqua" /> Generate Plan
          </h3>
          <div className="space-y-3">
            <select value={selectedId || ""} onChange={(e) => setSelectedId(Number(e.target.value))} className="input-field">
              <option value="">Select Candidate</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Position Title" className="input-field" />
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" className="input-field" />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field" />
            <button onClick={generate} disabled={loading} className="btn-primary w-full">
              {loading ? "Generating..." : "Generate Onboarding Plan"}
            </button>
          </div>
        </GlassCard>

        <div className="split-layout-main space-y-6">
          {plans.length > 0 && (
            <GlassCard>
              <h3 className="font-bold text-heading mb-3">Past Plans</h3>
              <div className="space-y-2">
                {plans.map((p) => (
                  <button key={p.id} onClick={() => loadPlan(p.id)} className="w-full text-left p-3 rounded-lg hover:bg-aqua/5 text-sm">
                    Plan #{p.id} — Candidate #{p.candidate_id}
                  </button>
                ))}
              </div>
            </GlassCard>
          )}
          {plan ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <GlassCard>
                <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-aqua" /> Offer Letter
                </h3>
                <RichTextContent
                  content={plan.offer_letter}
                  variant="on-light"
                  className="bg-cream rounded-xl p-4"
                  maxHeight="240px"
                />
              </GlassCard>

              <GlassCard delay={0.1}>
                <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-aqua" /> Joining Checklist
                </h3>
                <div className="space-y-2">
                  {plan.joining_checklist?.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/50 rounded-lg text-sm">
                      <span>{item.task}</span>
                      <span className="text-xs text-label">{item.due}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>

              {plan.training_plan?.modules && (
                <GlassCard delay={0.15}>
                  <h3 className="font-bold text-heading mb-4">Training Plan</h3>
                  <div className="space-y-2">
                    {plan.training_plan.modules.map((m, i) => (
                      <div key={i} className="flex justify-between p-3 bg-white/50 rounded-lg text-sm">
                        <span>{m.name}</span>
                        <span className="text-label">{m.duration}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}

              <div className="form-grid-3 gap-4">
                {[plan.day_30_plan, plan.day_60_plan, plan.day_90_plan].map((milestone, i) => (
                  <GlassCard key={i} delay={0.2 + i * 0.1}>
                    <h4 className="font-bold text-heading mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-aqua" />
                      {milestone?.title || `Day ${(i + 1) * 30}`}
                    </h4>
                    <ul className="space-y-2">
                      {milestone?.goals?.map((g, j) => (
                        <li key={j} className="text-xs text-body flex items-start gap-2">
                          <span className="text-aqua mt-0.5">•</span> {g}
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                ))}
              </div>
            </motion.div>
          ) : (
            <GlassCard className="text-center py-16">
              <UserPlus className="w-12 h-12 text-aqua/30 mx-auto mb-4" />
              <p className="text-muted">Select a candidate to generate AI-powered onboarding materials</p>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
