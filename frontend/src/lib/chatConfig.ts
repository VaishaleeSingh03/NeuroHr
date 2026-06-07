import { UserRole } from "@/context/AuthContext";
import { normalizeRole } from "@/lib/roleAccess";

export interface ChatRoleConfig {
  title: string;
  subtitle: string;
  placeholder: string;
  welcome: string;
  suggestions: string[];
}

const RECRUITER_CHAT: ChatRoleConfig = {
  title: "HR AI Assistant",
  subtitle: "Recruitment copilot — screening, candidates, interviews & onboarding",
  placeholder: "Ask about candidates, interviews, or hiring…",
  welcome:
    "Hello! I'm your **NeuroHR HR Assistant**. I can help you find and compare candidates, draft emails, plan onboarding, and prepare interview questions. How can I help?",
  suggestions: [
    "Find best Java developers",
    "Compare top 5 candidates",
    "Generate rejection email",
    "Prepare onboarding plan",
    "Generate interview questions for ML role",
  ],
};

const MANAGER_CHAT: ChatRoleConfig = {
  title: "HR AI Assistant",
  subtitle: "Team hiring & performance insights",
  placeholder: "Ask about your team, hiring pipeline, or interviews…",
  suggestions: [
    "Summarize our hiring pipeline",
    "Compare top candidates for open roles",
    "Interview preparation tips for managers",
    "Team attendance overview",
    "Who are the strongest applicants?",
  ],
  welcome:
    "Hello! I'm your **NeuroHR Assistant** for managers. I can help with hiring pipeline insights, candidate comparisons, and team HR questions. What do you need?",
};

const EMPLOYEE_CHAT: ChatRoleConfig = {
  title: "Career Assistant",
  subtitle: "Your personal HR & career copilot",
  placeholder: "Ask about leave, payroll, performance, or career growth…",
  welcome:
    "Hello! I'm your **Career Assistant**. I can help with leave, payslips, performance goals, and growing your skills. How can I support you today?",
  suggestions: [
    "How do I request leave?",
    "Tips to improve my performance review",
    "Explain my payslip components",
    "Career growth advice for my role",
    "What training should I focus on?",
  ],
};

const CANDIDATE_CHAT: ChatRoleConfig = {
  title: "Career Assistant",
  subtitle: "Job search, applications & interview prep",
  placeholder: "Ask about jobs, applications, or interview prep…",
  welcome:
    "Hello! I'm your **Career Assistant**. I can help you find roles, strengthen your applications, and prepare for AI interviews. What would you like to know?",
  suggestions: [
    "How do I prepare for my AI interview?",
    "Tips to improve my resume for tech roles",
    "What happens after I submit an application?",
    "How are interview scores calculated?",
    "What skills should I highlight on applications?",
  ],
};

export const CHAT_BY_ROLE: Record<UserRole, ChatRoleConfig> = {
  management_admin: RECRUITER_CHAT,
  hr_recruiter: RECRUITER_CHAT,
  senior_manager: MANAGER_CHAT,
  employee: EMPLOYEE_CHAT,
  candidate: CANDIDATE_CHAT,
};

export function getChatConfig(role: string | undefined): ChatRoleConfig {
  const normalized = normalizeRole(role);
  return CHAT_BY_ROLE[normalized || "candidate"];
}
