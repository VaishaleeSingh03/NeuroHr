"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users, FileSearch, Brain, Clock, DollarSign, Briefcase, Video, Send, Target,
} from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import GlassCard from "@/components/ui/GlassCard";
import PageHeader from "@/components/ui/PageHeader";
import ScoreIndicator from "@/components/ui/ScoreIndicator";
import { useAuth, UserRole } from "@/context/AuthContext";
import { analyticsAPI } from "@/lib/api";
import {
  DASHBOARD_STATS, STAT_LABELS, getStatLink, CANDIDATE_STAT_LINKS, EMPLOYEE_STAT_LINKS,
} from "@/lib/roleAccess";
import { formatDeadline, isInterviewExpired } from "@/lib/interviewUtils";
import ApplicationStatusBadge from "@/components/ui/ApplicationStatusBadge";
import { isApplicationRejected } from "@/lib/applicationStatus";
import HiringFlowSteps, { RECRUITER_DASHBOARD_FLOW } from "@/components/hiring/HiringFlowSteps";

const StaffDashboardCharts = dynamic(
  () => import("@/components/dashboard/StaffDashboardCharts"),
  { ssr: false, loading: () => <div className="responsive-grid-2 min-h-[220px]" /> },
);

const STAT_ICONS: Record<string, typeof Users> = {
  total_employees: Users,
  total_applications: FileSearch,
  average_ai_score: Brain,
  attendance_today: Clock,
  open_jobs: Briefcase,
  scheduled_interviews: Video,
};

function StaffDashboard({
  role,
  analytics,
}: {
  role: Exclude<UserRole, "candidate" | "employee">;
  analytics: Record<string, unknown>;
}) {
  const charts = (analytics?.charts as Record<string, unknown>) || {};
  const statKeys = DASHBOARD_STATS[role];
  const showHiringFunnel = role === "management_admin" || role === "hr_recruiter";
  const showMonthlyApps = role === "management_admin" || role === "hr_recruiter";
  const showPredictions = role === "management_admin" || role === "senior_manager";

  const subtitles: Record<string, string> = {
    management_admin: "Enterprise overview — employees, hiring & attendance",
    senior_manager: "Team overview — headcount, attendance & hiring pipeline",
    hr_recruiter: "Hiring hub — jobs, applications & interviews",
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Dashboard"
        subtitle={subtitles[role]}
      />

      {role === "hr_recruiter" && (
        <GlassCard hover={false} className="mb-6">
          <h3 className="font-bold text-heading mb-2 text-sm">Hiring flow</h3>
          <HiringFlowSteps steps={RECRUITER_DASHBOARD_FLOW} className="mb-3" />
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/dashboard/applications" className="text-accent hover:underline">Applications inbox</Link>
            <Link href="/dashboard/jobs" className="text-accent hover:underline">Post jobs</Link>
          </div>
        </GlassCard>
      )}

      <div className="responsive-grid">
        {statKeys.map((key, i) => {
          const meta = STAT_LABELS[key];
          const Icon = STAT_ICONS[key] || Brain;
          const raw = analytics[key] ?? analytics[key.replace(/_/g, "")];
          const value = meta?.format === "percent" ? `${Number(raw) || 0}%` : Number(raw) || 0;
          return (
            <StatCard
              key={key}
              title={meta?.title || key}
              value={value}
              icon={Icon}
              delay={i * 0.1}
              href={getStatLink(role, key)}
            />
          );
        })}
      </div>

      <StaffDashboardCharts
        role={role}
        charts={charts}
        analytics={analytics}
        showHiringFunnel={showHiringFunnel}
        showMonthlyApps={showMonthlyApps}
        showPredictions={showPredictions}
      />
    </div>
  );
}

function CandidateDashboard({ userName }: { userName: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyticsAPI.candidatePortal()
      .then((r) => setData(r.data))
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, []);

  const applications = (data?.recent_applications as Record<string, unknown>[]) || [];
  const upcoming = (data?.upcoming_interviews as Record<string, unknown>[]) || [];

  return (
    <div className="page-container">
      <PageHeader
        title={`Welcome, ${userName}`}
        subtitle="Your job search & interview dashboard"
      />

      <GlassCard hover={false} className="mb-6">
        <h3 className="font-bold text-heading mb-2 text-sm">Your hiring journey</h3>
        <div className="flex flex-wrap gap-2 text-xs text-body">
          {["Browse jobs", "Upload resume", "AI JD match", "Recruiter review", "Interview scheduled"].map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              <span className="w-5 h-5 rounded-full bg-aqua/20 text-accent flex items-center justify-center font-bold">{i + 1}</span>
              {s}
              {i < 4 && <span className="text-muted">→</span>}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted mt-2">You&apos;ll receive notifications when your application is reviewed or an interview is scheduled.</p>
      </GlassCard>

      <div className="responsive-grid">
        <StatCard title="Open Jobs" value={loading ? "…" : Number(data?.open_jobs) || 0} icon={Briefcase} href={CANDIDATE_STAT_LINKS.open_jobs} />
        <StatCard title="My Applications" value={loading ? "…" : Number(data?.applications_count) || 0} icon={Send} delay={0.1} href={CANDIDATE_STAT_LINKS.applications_count} />
        <StatCard title="Scheduled Interviews" value={loading ? "…" : Number(data?.interviews_scheduled) || 0} icon={Video} delay={0.2} href={CANDIDATE_STAT_LINKS.interviews_scheduled} />
        <StatCard title="Completed Interviews" value={loading ? "…" : Number(data?.interviews_completed) || 0} icon={Target} delay={0.3} href={CANDIDATE_STAT_LINKS.interviews_completed} />
      </div>

      <div className="responsive-grid-3">
        <GlassCard>
          <h3 className="font-bold text-heading mb-4">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { href: "/dashboard/job-openings", label: "Browse & apply to jobs" },
              { href: "/dashboard/interviews", label: "Join scheduled interview" },
              { href: "/dashboard/chat", label: "Career AI assistant" },
            ].map((a) => (
              <Link key={a.href} href={a.href} className="block text-sm text-accent hover:text-aqua-dark transition-colors">
                {a.label}
              </Link>
            ))}
          </div>
        </GlassCard>

        <GlassCard delay={0.1}>
          <h3 className="font-bold text-heading mb-4">Recent Applications</h3>
          {applications.length === 0 ? (
            <p className="text-sm text-muted">No applications yet — browse open jobs.</p>
          ) : (
            <div className="space-y-2">
              {applications.slice(0, 4).map((a) => {
                const rejected = isApplicationRejected(String(a.status));
                return (
                  <div
                    key={String(a.id)}
                    className={`text-sm p-2 rounded-lg ${rejected ? "bg-red-50 border border-red-200" : "bg-cream/50"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-heading">{String(a.jobTitle)}</p>
                      <ApplicationStatusBadge status={String(a.status)} size="xs" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        <GlassCard delay={0.2}>
          <h3 className="font-bold text-heading mb-4">Upcoming Interviews</h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">No interviews scheduled yet.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((i) => (
                <div key={String(i.id)} className="text-sm p-2 bg-cream/50 rounded-lg">
                  <p className="font-medium text-heading">{String(i.jobTitle)}</p>
                  <p className="text-xs text-muted">
                    Deadline: {formatDeadline(i as Record<string, unknown>)}
                    {isInterviewExpired(i as Record<string, unknown>) && (
                      <span className="text-red-600"> · Expired</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
          <Link href="/dashboard/interviews" className="btn-primary inline-block mt-4 text-sm">Go to My Interview</Link>
        </GlassCard>
      </div>
    </div>
  );
}

function EmployeeDashboard({ userName }: { userName: string }) {
  const [portal, setPortal] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    analyticsAPI.portal().then((r) => setPortal(r.data)).catch(() => {});
  }, []);

  const emp = portal?.employee as Record<string, unknown> | null;
  const performance = portal?.performance as Record<string, number> | null;
  const payroll = ((portal?.payroll as object[]) || [])[0] as Record<string, number> | undefined;
  const attendance = (portal?.attendance as object[]) || [];

  return (
    <div className="page-container">
      <PageHeader title={`Welcome, ${userName}`} subtitle="Your personal HR dashboard" />

      <div className="responsive-grid">
        <StatCard title="Department" value={String(emp?.department || "—")} icon={Users} />
        <StatCard title="AI Performance" value={`${Math.round(performance?.aiScore || 0)}%`} icon={Brain} delay={0.1} href={EMPLOYEE_STAT_LINKS.performance} />
        <StatCard title="Attendance Days" value={attendance.length} icon={Clock} delay={0.2} href={EMPLOYEE_STAT_LINKS.attendance} />
        <StatCard title="Latest Net Pay" value={payroll ? `$${payroll.netPay?.toLocaleString()}` : "—"} icon={DollarSign} delay={0.3} href={EMPLOYEE_STAT_LINKS.payroll} />
      </div>

      <div className="responsive-grid-3">
        <GlassCard>
          <h3 className="font-bold text-heading mb-4">Profile</h3>
          <p className="text-sm text-label">Designation</p>
          <p className="font-semibold text-heading">{String(emp?.designation || "—")}</p>
          <p className="text-sm text-label mt-3">Employee ID</p>
          <p className="font-semibold text-body">{String(emp?.employeeId || "—")}</p>
          <div className="mt-4 flex justify-center">
            <ScoreIndicator score={performance?.aiScore || 0} label="AI Score" size="md" />
          </div>
        </GlassCard>
        <GlassCard delay={0.1}>
          <h3 className="font-bold text-heading mb-4">Career Insights</h3>
          <p className="text-sm text-body">
            Promotion Chance:{" "}
            <span className="font-bold text-accent">{Math.round(performance?.promotionChance || 0)}%</span>
          </p>
          <p className="text-sm text-body mt-2">
            Attrition Risk:{" "}
            <span className="font-bold text-heading">{Math.round(performance?.attritionRisk || 0)}%</span>
          </p>
          <Link href="/dashboard/chat" className="btn-primary inline-block mt-4 text-sm">Ask AI Assistant</Link>
        </GlassCard>
        <GlassCard delay={0.2}>
          <h3 className="font-bold text-heading mb-4">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { href: "/dashboard/attendance", label: "Check In / Leave Request" },
              { href: "/dashboard/payroll", label: "View Payslips" },
              { href: "/dashboard/performance", label: "Performance Report" },
            ].map((a) => (
              <Link key={a.href} href={a.href} className="block text-sm text-accent hover:text-aqua-dark transition-colors">
                {a.label}
              </Link>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<Record<string, unknown>>({});
  const [analyticsReady, setAnalyticsReady] = useState(false);
  const firstName = user?.name?.split(" ")[0] || "there";

  useEffect(() => {
    if (!user) return;
    if (user.role === "candidate" || user.role === "employee") {
      setAnalyticsReady(true);
      return;
    }
    setAnalyticsReady(false);
    analyticsAPI.dashboard()
      .then((r) => setAnalytics(r.data))
      .catch(() => setAnalytics({}))
      .finally(() => setAnalyticsReady(true));
  }, [user]);

  if (!user) return null;

  if (user.role === "candidate") {
    return <CandidateDashboard userName={firstName} />;
  }

  if (user.role === "employee") {
    return <EmployeeDashboard userName={firstName} />;
  }

  if (!analyticsReady) {
    return (
      <div className="page-container flex items-center justify-center min-h-[40vh]">
        <div className="w-10 h-10 border-4 border-aqua border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user.role === "management_admin" || user.role === "senior_manager" || user.role === "hr_recruiter") {
    return <StaffDashboard role={user.role} analytics={analytics} />;
  }

  return null;
}
