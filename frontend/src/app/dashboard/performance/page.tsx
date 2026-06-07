"use client";

import { useEffect, useState } from "react";
import { Target, TrendingUp, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import ScoreIndicator from "@/components/ui/ScoreIndicator";
import RichTextEditor, { getRichHtml } from "@/components/ui/RichTextEditor";
import { performanceAPI, employeesAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function PerformancePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [myPerf, setMyPerf] = useState<Record<string, unknown> | null>(null);
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ employee_id: 0, period: "Q1 2026", feedback: "" });
  const canManage = user?.role === "senior_manager" || user?.role === "management_admin";

  useEffect(() => {
    if (user?.role === "employee") {
      performanceAPI.my().then((r) => setMyPerf(r.data)).catch(() => {});
    } else {
      performanceAPI.list().then((r) => setRecords(r.data)).catch(() => {});
      if (canManage) employeesAPI.list().then((r) => setEmployees(r.data.items || r.data)).catch(() => {});
    }
  }, [user]);

  const create = async () => {
    const feedback = getRichHtml(form.feedback);
    if (!form.employee_id || !feedback) {
      toast.error("Select an employee and enter feedback");
      return;
    }
    try {
      await performanceAPI.create({ ...form, feedback, tasks: [], goals: [], kpis: [] });
      toast.success("Performance record created with AI predictions");
      performanceAPI.list().then((r) => setRecords(r.data));
    } catch { toast.error("Failed to create performance record"); }
  };

  if (user?.role === "employee" && myPerf) {
    return (
      <div className="page-container">
        <h1 className="page-title">My Performance</h1>
        <div className="responsive-grid-3">
          <GlassCard className="flex flex-col items-center">
            <ScoreIndicator score={Number(myPerf.aiScore) || 0} label="AI Score" size="lg" />
          </GlassCard>
          <GlassCard>
            <p className="text-sm text-muted">Promotion Chance</p>
            <p className="text-3xl font-bold text-aqua">{Math.round(Number(myPerf.promotionChance) || 0)}%</p>
            <TrendingUp className="w-8 h-8 text-aqua/30 mt-4" />
          </GlassCard>
          <GlassCard>
            <p className="text-sm text-muted">Attrition Risk</p>
            <p className="text-3xl font-bold text-orange-500">{Math.round(Number(myPerf.attritionRisk) || 0)}%</p>
            <AlertCircle className="w-8 h-8 text-orange-200 mt-4" />
          </GlassCard>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header min-w-0">
        <h1 className="page-title">Performance Tracking</h1>
        <p className="page-subtitle">KPIs, goals, ML-powered predictions</p>
      </div>

      {canManage && (
        <GlassCard>
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-aqua" /> Add Performance Review
          </h3>
          <div className="space-y-3">
            <div className="form-grid-2 gap-3">
              <select className="input-field" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: Number(e.target.value) })}>
                <option value={0}>Select Employee</option>
                {employees.map((e) => (
                  <option key={String(e.id)} value={e.id as number}>
                    {(e.personalDetails as Record<string, string>)?.name}
                  </option>
                ))}
              </select>
              <input className="input-field" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
            </div>
            <RichTextEditor
              value={form.feedback}
              onChange={(html) => setForm({ ...form, feedback: html })}
              placeholder="Performance feedback and notes…"
              minHeight="120px"
            />
            <button onClick={create} className="btn-primary">Create with AI Prediction</button>
          </div>
        </GlassCard>
      )}

      <div className="responsive-grid-3">
        {records.map((r) => (
          <GlassCard key={String(r.id)}>
            <p className="text-sm text-muted">Employee #{String(r.employeeId)} · {String(r.period)}</p>
            <p className="text-2xl font-bold text-aqua mt-2">{Math.round(Number(r.aiScore) || 0)}%</p>
            <div className="flex gap-4 mt-3 text-xs text-muted">
              <span>Promotion: {Math.round(Number(r.promotionChance) || 0)}%</span>
              <span>Risk: {Math.round(Number(r.attritionRisk) || 0)}%</span>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
