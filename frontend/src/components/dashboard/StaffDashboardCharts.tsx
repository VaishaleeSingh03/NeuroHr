"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";
import GlassCard from "@/components/ui/GlassCard";
import { UserRole } from "@/context/AuthContext";

interface Props {
  role: Exclude<UserRole, "candidate" | "employee">;
  charts: Record<string, unknown>;
  analytics: Record<string, unknown>;
  showHiringFunnel: boolean;
  showMonthlyApps: boolean;
  showPredictions: boolean;
}

export default function StaffDashboardCharts({
  role,
  charts,
  analytics,
  showHiringFunnel,
  showMonthlyApps,
  showPredictions,
}: Props) {
  return (
    <div className="responsive-grid-2">
      {showHiringFunnel && (
        <Link href="/dashboard/applications" className="block">
          <GlassCard delay={0.2} className="cursor-pointer hover:border-aqua/30">
            <h3 className="font-bold text-heading mb-4">
              Hiring Funnel <span className="text-xs text-accent font-normal">→ Applications</span>
            </h3>
            <div className="w-full h-[220px] sm:h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(charts.funnel_bar as [string, number][])?.map(([name, value]) => ({ name, value })) || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F6E6C2" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#0D4F4F" }} />
                  <YAxis tick={{ fill: "#0D4F4F" }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#00B8B8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </Link>
      )}

      {showPredictions && (
        <GlassCard delay={0.3}>
          <h3 className="font-bold text-heading mb-4">AI Predictions</h3>
          <div className="space-y-3 sm:space-y-4">
            {(role === "senior_manager"
              ? [{ label: "Attrition Risk", value: (analytics?.predictions as Record<string, number>)?.attrition_risk_avg }]
              : [
                  { label: "Hiring Success", value: (analytics?.predictions as Record<string, number>)?.hiring_success_probability },
                  { label: "Growth Rate", value: (analytics?.predictions as Record<string, number>)?.employee_growth_rate },
                  { label: "Attrition Risk", value: (analytics?.predictions as Record<string, number>)?.attrition_risk_avg },
                ]
            ).map((p, i) => (
              <motion.div
                key={p.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex justify-between items-center bg-cream rounded-xl p-3"
              >
                <span className="text-sm text-label">{p.label}</span>
                <span className="font-bold text-accent">{Math.round(p.value || 0)}%</span>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      )}

      {role === "senior_manager" && !showHiringFunnel && (
        <GlassCard delay={0.2}>
          <h3 className="font-bold text-heading mb-4">Interview Pipeline</h3>
          <p className="text-sm text-body">
            Scheduled interviews:{" "}
            <span className="font-bold text-accent">{Number(analytics?.scheduled_interviews) || 0}</span>
          </p>
          <p className="text-sm text-body mt-2">
            Completed:{" "}
            <span className="font-bold text-heading">
              {(analytics?.interview_performance as Record<string, number>)?.total_interviews || 0}
            </span>
          </p>
        </GlassCard>
      )}

      {showMonthlyApps && (
        <Link href="/dashboard/applications" className={`block ${showHiringFunnel && showPredictions ? "md:col-span-2" : ""}`}>
          <GlassCard delay={0.4} className={`cursor-pointer hover:border-aqua/30 ${showHiringFunnel && showPredictions ? "md:col-span-2" : ""}`}>
            <h3 className="font-bold text-heading mb-4">
              Monthly Applications <span className="text-xs text-accent font-normal">→ Applications</span>
            </h3>
            <div className="w-full h-[220px] sm:h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={(charts.monthly_applications as { month: string; count: number }[]) || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F6E6C2" />
                  <XAxis dataKey="month" tick={{ fill: "#0D4F4F" }} />
                  <YAxis tick={{ fill: "#0D4F4F" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#00B8B8" strokeWidth={3} dot={{ fill: "#00B8B8", r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </Link>
      )}
    </div>
  );
}
