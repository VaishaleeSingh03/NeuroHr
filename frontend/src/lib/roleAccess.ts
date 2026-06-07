import { UserRole } from "@/context/AuthContext";



export type NavIconKey =

  | "dashboard"

  | "employees"

  | "applications"

  | "screening"

  | "jobs"

  | "job-openings"

  | "interviews"

  | "attendance"

  | "payroll"

  | "performance"

  | "ml-training"

  | "chat"

  | "analytics"

  | "onboarding"

  | "admin";



export interface RoleNavItem {

  href: string;

  label: string;

  icon: NavIconKey;

}



/** Sidebar navigation — single source of truth per role */

export const ROLE_NAV_ITEMS: Record<UserRole, RoleNavItem[]> = {

  management_admin: [

    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },

    { href: "/dashboard/employees", label: "Employees", icon: "employees" },

    { href: "/dashboard/applications", label: "Applications", icon: "applications" },

    { href: "/dashboard/screening", label: "Resume Screening", icon: "screening" },

    { href: "/dashboard/jobs", label: "Post Jobs", icon: "jobs" },

    { href: "/dashboard/interviews", label: "Interview Schedule", icon: "interviews" },

    { href: "/dashboard/attendance", label: "Attendance", icon: "attendance" },

    { href: "/dashboard/payroll", label: "Payroll", icon: "payroll" },

    { href: "/dashboard/performance", label: "Performance", icon: "performance" },

    { href: "/dashboard/ml-training", label: "ML Training", icon: "ml-training" },

    { href: "/dashboard/chat", label: "HR Assistant", icon: "chat" },

    { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" },

    { href: "/dashboard/onboarding", label: "Onboarding", icon: "onboarding" },

    { href: "/dashboard/admin", label: "Admin Panel", icon: "admin" },

  ],

  senior_manager: [

    { href: "/dashboard", label: "Team Dashboard", icon: "dashboard" },

    { href: "/dashboard/employees", label: "Team Members", icon: "employees" },

    { href: "/dashboard/interviews", label: "Interview Schedule", icon: "interviews" },

    { href: "/dashboard/performance", label: "Performance", icon: "performance" },

    { href: "/dashboard/attendance", label: "Attendance", icon: "attendance" },

    { href: "/dashboard/analytics", label: "Team Analytics", icon: "analytics" },

    { href: "/dashboard/chat", label: "HR Assistant", icon: "chat" },

  ],

  hr_recruiter: [

    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },

    { href: "/dashboard/applications", label: "Applications", icon: "applications" },

    { href: "/dashboard/screening", label: "Resume Screening", icon: "screening" },

    { href: "/dashboard/jobs", label: "Post Jobs", icon: "jobs" },

    { href: "/dashboard/interviews", label: "Interview Schedule", icon: "interviews" },

    { href: "/dashboard/onboarding", label: "Onboarding", icon: "onboarding" },

    { href: "/dashboard/employees", label: "Employees", icon: "employees" },

    { href: "/dashboard/chat", label: "HR Assistant", icon: "chat" },

    { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" },

  ],

  employee: [

    { href: "/dashboard", label: "My Dashboard", icon: "dashboard" },

    { href: "/dashboard/interviews", label: "Interview Schedule", icon: "interviews" },

    { href: "/dashboard/attendance", label: "Attendance", icon: "attendance" },

    { href: "/dashboard/payroll", label: "Salary", icon: "payroll" },

    { href: "/dashboard/performance", label: "Performance", icon: "performance" },

    { href: "/dashboard/chat", label: "Career Assistant", icon: "chat" },

  ],

  candidate: [

    { href: "/dashboard", label: "My Dashboard", icon: "dashboard" },

    { href: "/dashboard/job-openings", label: "Job Openings", icon: "job-openings" },

    { href: "/dashboard/interviews", label: "My Interview", icon: "interviews" },

    { href: "/dashboard/chat", label: "Career Assistant", icon: "chat" },

  ],

};



/** Routes each role may visit under /dashboard (derived from nav + home) */

export const ALLOWED_ROUTES: Record<UserRole, string[]> = Object.fromEntries(

  Object.entries(ROLE_NAV_ITEMS).map(([role, items]) => [

    role,

    Array.from(new Set(items.map((item) => item.href))),

  ])

) as Record<UserRole, string[]>;



export function isNavActive(pathname: string, href: string): boolean {

  if (href === "/dashboard") return pathname === "/dashboard";

  return pathname === href || pathname.startsWith(`${href}/`);

}



export function normalizeRole(role: string | undefined): UserRole | undefined {
  if (!role) return undefined;
  const r = role.trim().toLowerCase().replace(/\s+/g, "_");
  const aliases: Record<string, UserRole> = {
    admin: "management_admin",
    management_admin: "management_admin",
    senior_manager: "senior_manager",
    manager: "senior_manager",
    hr_recruiter: "hr_recruiter",
    recruiter: "hr_recruiter",
    employee: "employee",
    candidate: "candidate",
  };
  return aliases[r] || (r in ROLE_NAV_ITEMS ? (r as UserRole) : undefined);
}

/** True if this path is a sidebar tab (or sub-path) for the role */
export function canAccessRoute(role: UserRole | undefined, pathname: string): boolean {
  if (!pathname.startsWith("/dashboard")) return false;
  const normalized = normalizeRole(role);
  if (!normalized) return pathname === "/dashboard";
  const navHrefs = getNavItemsForRole(normalized).map((item) => item.href);
  return navHrefs.some((href) => isNavActive(pathname, href));
}



export function defaultRouteForRole(role: UserRole | string | undefined): string {
  const normalized = normalizeRole(role);
  return ROLE_NAV_ITEMS[normalized || "employee"]?.[0]?.href || "/dashboard";
}



export function getNavItemsForRole(role: UserRole | string | undefined): RoleNavItem[] {
  const normalized = normalizeRole(role);
  return ROLE_NAV_ITEMS[normalized || "employee"];
}



/** Which enterprise analytics stat keys each staff role may see on the main dashboard */

export const DASHBOARD_STATS: Record<

  Exclude<UserRole, "candidate" | "employee">,

  string[]

> = {

  management_admin: [

    "total_employees",

    "total_applications",

    "average_ai_score",

    "attendance_today",

  ],

  senior_manager: [

    "total_employees",

    "attendance_today",

    "average_ai_score",

    "total_applications",

  ],

  hr_recruiter: [

    "open_jobs",

    "total_applications",

    "average_ai_score",

    "scheduled_interviews",

  ],

};



export const STAT_LABELS: Record<string, { title: string; format?: "percent" }> = {
  total_employees: { title: "Total Employees" },
  total_applications: { title: "Applications" },
  average_ai_score: { title: "Avg AI Score", format: "percent" },
  attendance_today: { title: "Attendance Today" },
  open_jobs: { title: "Open Jobs" },
  scheduled_interviews: { title: "Scheduled Interviews" },
};

/** Dashboard stat card → page route */
export const STAT_LINKS: Record<string, string> = {
  open_jobs: "/dashboard/jobs",
  total_applications: "/dashboard/applications",
  average_ai_score: "/dashboard/applications",
  scheduled_interviews: "/dashboard/interviews",
  total_employees: "/dashboard/employees",
  attendance_today: "/dashboard/attendance",
};

export const CANDIDATE_STAT_LINKS: Record<string, string> = {
  open_jobs: "/dashboard/job-openings",
  applications_count: "/dashboard/job-openings",
  interviews_scheduled: "/dashboard/interviews",
  interviews_completed: "/dashboard/interviews",
};

export const EMPLOYEE_STAT_LINKS: Record<string, string> = {
  performance: "/dashboard/performance",
  attendance: "/dashboard/attendance",
  payroll: "/dashboard/payroll",
};

const STAT_LINK_FALLBACK: Partial<Record<UserRole, Partial<Record<string, string>>>> = {
  senior_manager: {
    total_applications: "/dashboard/analytics",
    average_ai_score: "/dashboard/analytics",
  },
  management_admin: {
    average_ai_score: "/dashboard/screening",
  },
};

export const SCHEDULER_ROLES: UserRole[] = ["hr_recruiter", "management_admin", "senior_manager"];
export const RECRUITER_ROLES: UserRole[] = ["hr_recruiter", "management_admin"];
export const CHECK_IN_ROLES: UserRole[] = ["employee", "senior_manager", "hr_recruiter", "management_admin"];
export const LEAVE_APPROVER_ROLES: UserRole[] = ["senior_manager", "management_admin"];
export const EMPLOYEE_MANAGER_ROLES: UserRole[] = ["management_admin", "hr_recruiter"];
export const PERFORMANCE_MANAGER_ROLES: UserRole[] = ["senior_manager", "management_admin"];

export function isSchedulerRole(role: string | undefined): boolean {
  const r = normalizeRole(role);
  return r ? SCHEDULER_ROLES.includes(r) : false;
}

export function isRecruiterRole(role: string | undefined): boolean {
  const r = normalizeRole(role);
  return r ? RECRUITER_ROLES.includes(r) : false;
}

export function isCandidateRole(role: string | undefined): boolean {
  return normalizeRole(role) === "candidate";
}

export function canCheckIn(role: string | undefined): boolean {
  const r = normalizeRole(role);
  return r ? CHECK_IN_ROLES.includes(r) : false;
}

export function canApproveLeave(role: string | undefined): boolean {
  const r = normalizeRole(role);
  return r ? LEAVE_APPROVER_ROLES.includes(r) : false;
}

export function canManageEmployees(role: string | undefined): boolean {
  const r = normalizeRole(role);
  return r ? EMPLOYEE_MANAGER_ROLES.includes(r) : false;
}

export function canManagePerformance(role: string | undefined): boolean {
  const r = normalizeRole(role);
  return r ? PERFORMANCE_MANAGER_ROLES.includes(r) : false;
}

export function getStatLink(role: UserRole, statKey: string): string | undefined {
  const normalized = normalizeRole(role);
  if (!normalized) return undefined;
  const preferred = STAT_LINK_FALLBACK[normalized]?.[statKey] || STAT_LINKS[statKey];
  if (!preferred) return undefined;
  const navHrefs = getNavItemsForRole(normalized).map((item) => item.href);
  if (navHrefs.some((href) => preferred === href || preferred.startsWith(`${href}/`))) {
    return preferred;
  }
  return STAT_LINK_FALLBACK[normalized]?.[statKey];
}


