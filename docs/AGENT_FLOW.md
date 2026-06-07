# Agent Flow — Guide for AI Coding Agents

If you're a Cursor agent (or similar) working in this repo, treat this as your map. Read it before changing hiring, mail, or ML code.

---

## Project layout

```
AI-Based HR Module/
├── frontend/              Next.js 14, TypeScript — port 3000
├── backend-express/       Express + Mongoose — port 8000  ← active API
├── ml-service/            FastAPI + Groq — port 8001
├── knowledgebase/         Org KB for JD generation
├── ml-models/             .pkl artifacts
├── docs/                  Flow documentation
└── .env                   Root secrets (never commit)
```

> Legacy `backend/` (old FastAPI monolith) is **not** the active API. Use `backend-express/`.

---

## Run locally

| Service | Command | Port |
|---------|---------|------|
| ML | `cd ml-service && python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload` | 8001 |
| API | `cd backend-express && npm run dev` | 8000 |
| Frontend | `cd frontend && npm run dev` | 3000 |

**PowerShell:** use `;` not `&&`.

**Mail setup (once):** `npm run auth:calendar`, `npm run auth:agent`, `npm run verify:mail` in `backend-express/`.

Restart Express after backend edits. Restart ML after pipeline edits.

---

## Business rules — do not break silently

### 12-step hiring pipeline

Source of truth: `frontend/src/lib/hiringPipeline.ts` (`FULL_HIRING_PIPELINE`).

| Step | Gate |
|------|------|
| 6 HR screening | ≥80% → auto-shortlist; **no auto-reject** |
| 9 HR AI review | `aiInterviewReview.decision` must be `qualified` for human panel |
| 11 Panel complete | `complete-human-interview` before `final-decision` offer |
| 12 Offer | Candidate `offer-response` accept/decline |

### Scoring

| Check | File |
|-------|------|
| Auto-shortlist 80% | `applicationService.js` → `finalizeApplicationAfterScreening` |
| Schedule interview | `interviewOutcome.js` → `canScheduleInterviewForApplication` (needs `shortlisted`) |
| Interview eval | `interview_evaluator.py` — **Groq only** (`harness_groq`) |
| Post-interview | `interviews.js` → `finalizeApplicationAfterInterview` — sets review **pending**, no auto-reject |
| Human panel | `hiringPipeline.ts` → `canScheduleHumanInterview`, `canCompleteHumanPanel`, `canSendFinalDecision` |

### Email

| Channel | Helper | Used for |
|---------|--------|----------|
| HR OAuth | `sendHrEmail` | Interviews, offers, payslips |
| Agent OAuth | `sendAgentEmail` | Leave, reimbursement, offer response → HR |
| Groq | `sendHrGroqEmail` / `sendAgentGroqEmail` | Offers, some HR types |
| Templates | `emailTemplates.js` | **Payslip, leave** — prefer templates for ops reliability |

`emailLayout.js` — responsive HTML shell for all outbound mail.

**Do not** make payroll or leave success depend on Groq — save record first, catch email errors.

### Attendance

Face verification was removed from check-in. Don't re-add camera gates unless asked.

Leave requests need a matching **Employee** profile (`resolveEmployee` in `attendance.js`).

---

## Feature → file map

### Hiring

| Feature | Backend | Frontend |
|---------|---------|----------|
| KB JD | `routes/jobs.js`, ML `jd_generator.py` | `jobs/page.tsx` |
| Approve job | `routes/jobs.js` | `jobs/page.tsx` |
| Apply + screen | `lib/applicationService.js` | `job-openings/page.tsx` |
| Inbox + pipeline | `routes/jobs.js` | `applications/page.tsx`, `HiringPipelineFlow.tsx` |
| AI interview | `routes/interviews.js` | `interviews/page.tsx` |
| Human panel | `routes/jobs.js` | `applications/page.tsx` |
| Offer response | `routes/jobs.js` | `job-openings/page.tsx` |
| Pipeline lib | — | `lib/hiringPipeline.ts`, `usePipelineHashScroll.ts` |

### HR ops

| Feature | Backend | Frontend |
|---------|---------|----------|
| Leave | `routes/attendance.js`, `leaveService.js` | `attendance/page.tsx` |
| Payroll | `routes/payroll.js`, `payrollService.js` | `payroll/page.tsx` |
| Reimbursement | `routes/reimbursements.js` | payroll area |

### Shared frontend libs

| Module | Purpose |
|--------|---------|
| `hiringPipeline.ts` | 12 steps, gates, hrefs |
| `applicationStatus.ts` | Thresholds, status helpers |
| `roleAccess.ts` | Nav and permissions |
| `interviewSchedule.ts` | Deadline validation |

### Shared backend libs

| Module | Purpose |
|--------|---------|
| `emailService.js` | HR + Agent OAuth send |
| `hrMailAuth.js` / `agentMailAuth.js` | Google OAuth |
| `emailTemplates.js` | Static transactional emails |
| `groqEmailService.js` | Groq-generated mail |
| `notify.js` | Notifications + some Groq offers |

### ML pipelines (Groq-critical)

| Pipeline | File |
|----------|------|
| Groq core | `groq_service.py` |
| Resume SOP | `resume_screener.py` |
| KB / JD | `knowledgebase.py`, `jd_generator.py` |
| Interview eval | `interview_evaluator.py`, `interview_full_analyzer.py` |
| HR email gen | `hr_email_generator.py` |
| Briefing | `interviewer_briefing.py` |

Express → ML via `services/mlClient.js`.

---

## Typical agent tasks

### "Fix hiring gate / pipeline step"

1. Read `hiringPipeline.ts` gates  
2. Check matching route in `routes/jobs.js` or `interviews.js`  
3. Update `HiringPipelineFlow.tsx` if UI step labels wrong  
4. Sync `docs/FULL_HIRING_FLOW.md` if behavior changed  

### "Fix email failure crashing API"

1. Wrap send in try/catch; return success with `email_sent: false`  
2. Prefer `emailTemplates.js` for transactional ops (payslip, leave)  
3. Verify OAuth: `verify-mail-calendar.js`  

### "Change shortlist threshold"

1. `applicationService.js`  
2. `applicationStatus.ts`  
3. Docs: `HIRING_FLOW.md`, `ML_FLOW.md`, `README.md`  

### "Add recruiter API feature"

1. Route + `auth(RECRUITER_ROLES)` in `routes/jobs.js`  
2. Method in `frontend/src/lib/api.ts`  
3. Wire `applications/page.tsx`; use `getApiErrorMessage`  

---

## Roles

| Role | ID |
|------|-----|
| Management Admin | `management_admin` |
| Senior Manager | `senior_manager` |
| HR Recruiter | `hr_recruiter` |
| Employee | `employee` |
| Candidate | `candidate` |

---

## Demo accounts

| Email | Password | Role |
|-------|----------|------|
| admin@neurohr.com | admin123 | Admin |
| recruiter@neurohr.com | recruiter123 | Recruiter |
| candidate@neurohr.com | candidate123 | Candidate |
| employee@neurohr.com | employee123 | Employee |
| vaishaleeaiml@gmail.com | 123456 | HR Admin |

`npm run seed` / `npm run seed:force` in `backend-express/`.

---

## API base

`http://localhost:8000/api/v1` — `Authorization: Bearer <token>`

Key routes: see [FULL_HIRING_FLOW.md](./FULL_HIRING_FLOW.md) API table.

---

## Conventions

1. **Small diffs** — match existing style.  
2. **Reuse libs** — don't duplicate pipeline or role logic in pages.  
3. **Don't commit** unless the user asks.  
4. **Never commit** `.env`, `token.json`, `agent-token.json`, credentials JSON.  
5. **Test build** after frontend changes: `cd frontend && npm run build`.  
6. **Update docs** when changing hiring gates or mail behavior.  

---

## Related reading

- [Full Hiring Flow](./FULL_HIRING_FLOW.md)  
- [ML Flow](./ML_FLOW.md)  
- [README](../README.md)  
