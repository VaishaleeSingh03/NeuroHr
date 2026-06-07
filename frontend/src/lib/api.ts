import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  register: (data: { name: string; email: string; password: string; role: string }) =>
    api.post("/auth/register", data),
  me: () => api.get("/auth/me"),
};

export const employeesAPI = {
  list: (params?: { page?: number; department?: string; limit?: number }) =>
    api.get("/employees", { params }),
  panelRoster: () => api.get<{ calendar_configured: boolean; employees: object[] }>("/employees/panel-roster"),
  addPanelEmployee: (data: {
    name: string;
    email: string;
    designation?: string;
    department?: string;
    role?: string;
  }) => api.post("/employees/panel-roster", data),
  get: (id: number) => api.get(`/employees/${id}`),
  create: (data: object) => api.post("/employees", data),
  suggestSalary: (data: {
    name?: string;
    designation?: string;
    department?: string;
    skills?: string[];
  }) => api.post("/employees/suggest-salary", data),
  update: (id: number, data: object) => api.put(`/employees/${id}`, data),
  aiInsights: (id: number) => api.post(`/employees/${id}/ai-insights`),
  promote: (id: number, data: { designation: string; salary: number }) =>
    api.post(`/employees/${id}/promote`, data),
};

export const jobsAPI = {
  list: () => api.get("/jobs"),
  get: (id: number) => api.get(`/jobs/${id}`),
  create: (data: { title: string; description: string; employment_type?: string; department?: string }) =>
    api.post("/jobs", data),
  generateFromKB: (data: {
    role_title: string;
    experience_level?: string;
    department?: string;
    employment_type?: string;
    feedback?: string;
  }) => api.post("/jobs/generate-from-kb", data),
  approveJob: (id: number, data?: { title?: string; description?: string; employment_type?: string; department?: string }) =>
    api.post(`/jobs/${id}/approve`, data || {}),
  rejectDraft: (id: number) => api.post(`/jobs/${id}/reject-draft`),
  deleteJob: (id: number) => api.delete(`/jobs/${id}`),
  kbStatus: () => api.get("/jobs/knowledgebase/status"),
  calendarStatus: () => api.get("/jobs/calendar-status"),
  analyze: (id: number) => api.post(`/jobs/${id}/analyze`),
  apply: (jobId: number, form: FormData) =>
    api.post(`/jobs/${jobId}/apply`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 300000,
    }),
  myApplications: () => api.get("/jobs/applications/my"),
  applicationsInbox: (params?: { job_id?: number; status?: string }) =>
    api.get("/jobs/applications/inbox", { params }),
  updateApplicationStatus: (
    appId: number,
    status: string,
    opts?: { message?: string; reason?: "screening" | "interview"; stage?: string },
  ) =>
    api.patch(`/jobs/applications/${appId}/status`, {
      status,
      ...(opts?.message ? { message: opts.message } : {}),
      ...(opts?.reason ? { reason: opts.reason } : {}),
      ...(opts?.stage ? { stage: opts.stage } : {}),
    }),
  sendApplicationMessage: (appId: number, data: { message: string; status?: string }) =>
    api.post(`/jobs/applications/${appId}/message`, data),
  aiInterviewDecision: (appId: number, data: { decision: "qualified" | "reject"; note?: string }) =>
    api.post(`/jobs/applications/${appId}/ai-interview-decision`, data),
  scheduleHumanInterview: (appId: number, data: {
    interview_date: string;
    interview_time: string;
    duration_minutes?: number;
    meet_link?: string;
    interviewer_name?: string;
    interviewer_email?: string;
    interviewer_role?: string;
    interviewers?: { name: string; email: string; role?: string; employeeId?: number }[];
    employee_ids?: number[];
    notes?: string;
    round_number?: number;
  }) => api.post(`/jobs/applications/${appId}/schedule-human-interview`, data),
  completeHumanInterview: (appId: number, data?: { notes?: string; panel_notes?: string }) =>
    api.post(`/jobs/applications/${appId}/complete-human-interview`, data || {}),
  finalDecision: (appId: number, data: {
    decision: "selected" | "rejected";
    salary?: string;
    start_date?: string;
    message?: string;
    gender?: string;
  }) => api.post(`/jobs/applications/${appId}/final-decision`, data),
  offerResponse: (appId: number, data: {
    response: "accepted" | "rejected";
    message?: string;
    gender?: string;
  }) => api.post(`/jobs/applications/${appId}/offer-response`, data),
  jobApplications: (jobId: number) => api.get(`/jobs/${jobId}/applications`),
  getApplicationResume: (appId: number) =>
    api.get(`/jobs/applications/${appId}/resume`, { responseType: "blob" }),
};

export const notificationsAPI = {
  list: () => api.get("/notifications"),
  markRead: (id: number) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post("/notifications/read-all"),
};

export const screeningAPI = {
  upload: (file: File, jobId: number, contactEmail?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("job_id", String(jobId));
    if (contactEmail?.trim()) form.append("contact_email", contactEmail.trim());
    return api.post("/screening/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  bulkUpload: (files: File[], jobId: number, contactEmail?: string) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.append("job_id", String(jobId));
    if (contactEmail?.trim()) form.append("contact_email", contactEmail.trim());
    return api.post("/screening/bulk-upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  candidates: (jobId?: number, uploadedOnly = true) =>
    api.get("/screening/candidates", {
      params: {
        ...(jobId ? { job_id: jobId } : {}),
        ...(uploadedOnly ? { uploaded_only: "true" } : {}),
      },
    }),
  getCandidate: (id: number) => api.get(`/screening/candidates/${id}`),
};

export const interviewsAPI = {
  schedule: (data: {
    candidate_id: number;
    job_id: number;
    scheduled_at: string;
    deadline_at?: string;
    application_id?: number;
  }) =>
    api.post("/interviews/schedule", {
      ...data,
      deadline_at: data.deadline_at || data.scheduled_at,
    }),
  start: (interviewId: number) =>
    api.post("/interviews/start", { interview_id: interviewId }),
  submit: (id: number, data: { answers: object[]; transcript?: string; video_analysis?: object }) =>
    api.post(`/interviews/${id}/submit`, data),
  saveAnswer: (id: number, data: { question: string; answer: string; question_index: number; duration_seconds?: number }) =>
    api.post(`/interviews/${id}/save-answer`, data),
  uploadRecording: (id: number, blob: Blob, durationSeconds: number) => {
    const form = new FormData();
    form.append("recording", blob, `interview_${id}.webm`);
    form.append("duration_seconds", String(durationSeconds));
    return api.post(`/interviews/${id}/upload-recording`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  getStatus: (id: number) => api.get(`/interviews/${id}/status`),
  get: (id: number) => api.get(`/interviews/${id}`),
  analyzeFrame: (id: number, image: string) =>
    api.post(`/interviews/${id}/analyze-frame`, { image }),
  list: () => api.get("/interviews"),
  my: () => api.get("/interviews/my"),
};

export const attendanceAPI = {
  checkIn: () => api.post("/attendance/check-in"),
  checkOut: () => api.post("/attendance/check-out"),
  list: (params?: object) => api.get("/attendance", { params }),
  my: () => api.get("/attendance/my"),
  requestLeave: (data: { type: string; from_date: string; to_date: string; reason: string }) =>
    api.post("/attendance/leave", data),
  approveLeave: (id: number) => api.patch(`/attendance/leave/${id}/approve`),
  leaves: (employeeId?: number) =>
    api.get("/attendance/leaves", { params: employeeId ? { employee_id: employeeId } : {} }),
  leaveBalances: () => api.get("/attendance/leave-balances"),
  leaveSummary: (employeeId: number) => api.get(`/attendance/leave-summary/${employeeId}`),
};

export const payrollAPI = {
  generate: (data: { employee_id: number; month: string; bonus?: number; deductions?: number }) =>
    api.post("/payroll/generate", data),
  generateBatch: (data: { month: string; bonus?: number; deductions?: number }) =>
    api.post("/payroll/generate-batch", data),
  preview: (params: { employee_id: number; month: string; bonus?: number; deductions?: number }) =>
    api.get("/payroll/preview", { params }),
  list: (month?: string) => api.get("/payroll", { params: month ? { month } : {} }),
  my: () => api.get("/payroll/my"),
  payslip: (id: number) => api.get(`/payroll/payslip/${id}`),
  downloadPayslipPdf: (id: number) =>
    api.get(`/payroll/payslip/${id}/pdf`, { responseType: "blob" }),
};

export const reimbursementsAPI = {
  submit: (data: FormData) =>
    api.post("/reimbursements", data, { headers: { "Content-Type": "multipart/form-data" } }),
  my: () => api.get("/reimbursements/my"),
  list: (status?: string) => api.get("/reimbursements", { params: status ? { status } : {} }),
  updateStatus: (id: number, status: string, note?: string) =>
    api.patch(`/reimbursements/${id}/status`, { status, note }),
};

export const performanceAPI = {
  list: (employeeId?: number) =>
    api.get("/performance", { params: employeeId ? { employee_id: employeeId } : {} }),
  my: () => api.get("/performance/my"),
  create: (data: object) => api.post("/performance", data),
  update: (id: number, data: object) => api.put(`/performance/${id}`, data),
};

export const mlAPI = {
  uploadDataset: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/ml/upload-dataset", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  train: (file: File | null, config: object) => {
    const form = new FormData();
    if (file) form.append("file", file);
    Object.entries(config).forEach(([k, v]) => form.append(k, String(v)));
    return api.post("/ml/train", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  models: () => api.get("/ml/models"),
};

export const chatAPI = {
  send: (message: string, sessionId?: string) =>
    api.post("/chat/message", { message, session_id: sessionId }),
  history: () => api.get("/chat/history"),
};

export const analyticsAPI = {
  dashboard: () => api.get("/analytics/dashboard"),
  portal: () => api.get("/analytics/portal"),
  candidatePortal: () => api.get("/analytics/candidate-portal"),
};

export const onboardingAPI = {
  generate: (data: { candidate_id: number; job_title: string; department?: string; start_date?: string }) =>
    api.post("/onboarding/generate", data),
  list: () => api.get("/onboarding"),
  get: (id: number) => api.get(`/onboarding/${id}`),
};

export const documentsAPI = {
  analyze: (file: File, documentType: string, candidateId?: number) => {
    const form = new FormData();
    form.append("file", file);
    form.append("document_type", documentType);
    if (candidateId) form.append("candidate_id", String(candidateId));
    return api.post("/documents/analyze", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  list: () => api.get("/documents"),
};

export const adminAPI = {
  users: () => api.get("/admin/users"),
  createUser: (data: object) => api.post("/admin/users", data),
  updateUser: (id: number, data: object) => api.patch(`/admin/users/${id}`, data),
  deleteUser: (id: number) => api.delete(`/admin/users/${id}`),
};

export default api;
