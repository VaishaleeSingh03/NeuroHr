"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TrendingUp, Target, Clock, Award, BarChart3, Users } from "lucide-react";
import GlassCard from "@/components/ui/GlassCard";
import StatCard from "@/components/ui/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import { analyticsAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { canAccessRoute, normalizeRole } from "@/lib/roleAccess";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";

export default function AnalyticsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const role = user?.role;

  useEffect(() => {
    if (user && !canAccessRoute(normalizeRole(user.role), "/dashboard/analytics")) {
      router.replace("/dashboard");
      return;
    }
    analyticsAPI.dashboard().then((r) => setData(r.data)).catch(() => {});
  }, [user, router]);

  const charts = (data?.charts as Record<string, unknown>) || {};
  const predictions = (data?.predictions as Record<string, number>) || {};
  const interviewPerf = (data?.interview_performance as Record<string, number>) || {};

  const isRecruiter = role === "hr_recruiter";
  const isManager = role === "senior_manager";

  const statCards = isRecruiter
    ? [
        { title: "Applications", value: Number(data?.total_applications) || 0, icon: TrendingUp },
        { title: "Open Jobs", value: Number(data?.open_jobs) || 0, icon: Award, delay: 0.1 },
        { title: "Scheduled Interviews", value: Number(data?.scheduled_interviews) || 0, icon: Clock, delay: 0.2 },
        { title: "Avg AI Score", value: `${Number(data?.average_ai_score) || 0}%`, icon: Target, delay: 0.3 },
      ]
    : isManager
      ? [
          { title: "Team Size", value: Number(data?.total_employees) || 0, icon: Users },
          { title: "Attendance Today", value: Number(data?.attendance_today) || 0, icon: Clock, delay: 0.1 },
          { title: "Applications", value: Number(data?.total_applications) || 0, icon: TrendingUp, delay: 0.2 },
          { title: "Avg AI Score", value: `${Number(data?.average_ai_score) || 0}%`, icon: Target, delay: 0.3 },
        ]
      : [
          { title: "Total Applications", value: Number(data?.total_applications) || 0, icon: TrendingUp },
          { title: "Selected", value: Number(data?.selected_candidates) || 0, icon: Award, delay: 0.1 },
          { title: "Rejected", value: Number(data?.rejected_candidates) || 0, icon: Target, delay: 0.2 },
          { title: "Avg AI Score", value: `${Number(data?.average_ai_score) || 0}%`, icon: Clock, delay: 0.3 },
        ];

  const predictionCards = isRecruiter
    ? [{ label: "Hiring Success Probability", value: predictions.hiring_success_probability }]
    : isManager
      ? [{ label: "Attrition Risk Avg", value: predictions.attrition_risk_avg }]
      : [
          { label: "Hiring Success Probability", value: predictions.hiring_success_probability },
          { label: "Employee Growth Rate", value: predictions.employee_growth_rate },
          { label: "Attrition Risk Avg", value: predictions.attrition_risk_avg },
        ];

  const subtitles: Record<string, string> = {
    hr_recruiter: "Hiring analytics — applications, jobs & interviews",
    senior_manager: "Team analytics — headcount & workforce trends",
    management_admin: "Advanced hiring analytics with ML-powered predictions",
  };

  return (
    <div className="page-container">
      <PageHeader
        title={isManager ? "Team Analytics" : "Analytics Dashboard"}
        subtitle={subtitles[role || "management_admin"] || subtitles.management_admin}
        icon={BarChart3}
      />

      <div className="responsive-grid">
        {statCards.map((s) => (
          <StatCard key={s.title} title={s.title} value={s.value} icon={s.icon} delay={s.delay} />
        ))}
      </div>

      <div className="responsive-grid-3">
        {predictionCards.map((p, i) => (
          <GlassCard key={p.label} delay={i * 0.1} className="text-center">
            <p className="text-sm text-label">{p.label}</p>
            <motion.p initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="text-3xl sm:text-4xl font-bold text-accent mt-2">
              {Math.round(p.value || 0)}%
            </motion.p>
          </GlassCard>
        ))}
      </div>

      <div className="responsive-grid-2">
        {(role === "management_admin" || role === "hr_recruiter") && (
          <GlassCard>
            <h3 className="font-bold text-heading mb-4">Skill Trends</h3>
            <div className="w-full h-[220px] sm:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(charts.skill_heatmap as { skill: string; count: number }[]) || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F6E6C2" />
                  <XAxis type="number" tick={{ fill: "#0D4F4F" }} />
                  <YAxis dataKey="skill" type="category" width={80} tick={{ fontSize: 10, fill: "#0D4F4F" }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#00B8B8" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        )}

        <GlassCard delay={0.1}>
          <h3 className="font-bold text-heading mb-4">Interview Performance</h3>
          <div className="space-y-4">
            {[
              { label: "Avg Technical", value: interviewPerf.avg_technical },
              { label: "Avg Communication", value: interviewPerf.avg_communication },
              { label: "Total Interviews", value: interviewPerf.total_interviews },
            ].map((m) => (
              <div key={m.label} className="flex justify-between p-3 bg-cream rounded-xl">
                <span className="text-sm text-label">{m.label}</span>
                <span className="font-bold text-accent">
                  {typeof m.value === "number" ? Math.round(m.value) : m.value || 0}
                  {m.label.includes("Total") ? "" : "%"}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>

        {(role === "management_admin" || role === "hr_recruiter") && (
          <GlassCard delay={0.2} className="md:col-span-2">
            <h3 className="font-bold text-heading mb-4">Monthly Applications</h3>
            <div className="w-full h-[220px] sm:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={(charts.monthly_applications as { month: string; count: number }[]) || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F6E6C2" />
                  <XAxis dataKey="month" tick={{ fill: "#0D4F4F" }} />
                  <YAxis tick={{ fill: "#0D4F4F" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#00B8B8" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
