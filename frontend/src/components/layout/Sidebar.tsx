"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard, FileSearch, Briefcase, Video, Brain,
  MessageSquare, BarChart3, UserPlus, Settings, LogOut, Sparkles,
  Users, Clock, DollarSign, Target, X,
} from "lucide-react";
import { useAuth, UserRole } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  getNavItemsForRole, isNavActive, NavIconKey, RoleNavItem, normalizeRole,
} from "@/lib/roleAccess";

const ICONS: Record<NavIconKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  employees: Users,
  applications: Users,
  screening: FileSearch,
  jobs: Briefcase,
  "job-openings": Briefcase,
  interviews: Video,
  attendance: Clock,
  payroll: DollarSign,
  performance: Target,
  "ml-training": Brain,
  chat: MessageSquare,
  analytics: BarChart3,
  onboarding: UserPlus,
  admin: Settings,
};

const roleLabels: Record<UserRole, string> = {
  management_admin: "Management Admin",
  senior_manager: "Senior Manager",
  hr_recruiter: "HR Recruiter",
  employee: "Employee",
  candidate: "Candidate",
};

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const role = normalizeRole(user?.role);
  const items = getNavItemsForRole(role);

  const goTo = (href: string) => {
    onClose?.();
    if (pathname !== href) router.push(href);
  };

  return (
    <aside className="w-64 sm:w-72 h-screen sticky top-0 z-30 bg-gradient-sidebar backdrop-blur-xl border-r border-aqua/20 flex flex-col shrink-0">
      <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-aqua rounded-xl flex items-center justify-center shadow-glow">
            <Sparkles className="w-6 h-6 text-inverse" />
          </div>
          <div>
            <h1 className="text-inverse font-bold text-base sm:text-lg leading-tight">NeuroHR AI</h1>
            <p className="text-accent-light text-xs">Enterprise HRMS</p>
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-inverse/70 hover:text-inverse hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 p-3 sm:p-4 space-y-0.5 overflow-y-auto">
        {items.map((item: RoleNavItem) => {
          const Icon = ICONS[item.icon];
          const active = isNavActive(pathname, item.href);
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => goTo(item.href)}
              className={cn("sidebar-link w-full text-left", active && "sidebar-link-active")}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 sm:p-4 border-t border-white/10">
        <div className="px-3 sm:px-4 py-2 mb-2">
          <p className="text-inverse text-sm font-medium truncate">{user?.name}</p>
          <p className="text-inverse/50 text-xs">{role ? roleLabels[role] : ""}</p>
        </div>
        <button type="button" onClick={logout} className="sidebar-link w-full text-red-300 hover:text-red-200">
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
