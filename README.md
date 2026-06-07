# NeuroHR AI

**Hire smarter, run HR calmer — one platform from job post to payslip.**

NeuroHR AI is an enterprise HRMS with a full hiring pipeline: knowledge-base job descriptions, Groq-powered resume screening, voice AI interviews, human panel rounds, offers, and day-to-day HR (attendance, leave, payroll). Recruiters stay in control at every checkpoint. Candidates get clear updates along the way.

![Tech Stack](https://img.shields.io/badge/Frontend-Next.js-blue) ![Backend](https://img.shields.io/badge/Backend-Express.js-green) ![ML](https://img.shields.io/badge/ML-FastAPI-orange) ![AI](https://img.shields.io/badge/AI-Groq-purple) ![Docker](https://img.shields.io/badge/Docker-Ready-blue)

---

## Where to read more

| Guide | Best for |
|-------|----------|
| [**docs/README.md**](./docs/README.md) | Quick orientation — start here if you're new |
| [**Full Hiring Flow**](./docs/FULL_HIRING_FLOW.md) | The complete **12-step** pipeline with pages and APIs |
| [**Hiring Flow**](./docs/HIRING_FLOW.md) | A walkthrough you'd give a recruiter or demo audience |
| [**ML Flow**](./docs/ML_FLOW.md) | How Groq, parsing, and scoring work under the hood |
| [**Org KB Flow**](./docs/ORG_KB_FLOW.md) | Knowledge base → JD generation |
| [**Agent Flow**](./docs/AGENT_FLOW.md) | For Cursor agents — file map and safe edits |
| [**Deployment**](./DEPLOYMENT.md) | Docker and production |

---

## What you can do

### Hiring (12 steps)

1. **KB analysis** — Agent reads your org knowledge base for real tech stacks  
2. **JD draft** — Groq writes a grounded job description (saved as draft)  
3. **Approve & post** — HR reviews, then publishes to Job Openings  
4. **Apply** — Candidate uploads resume  
5. **Resume screen** — Groq harness SOP scores fit vs JD  
6. **HR screening** — Auto-shortlist at **≥80%**; HR can also shortlist or reject manually  
7. **Schedule AI interview** — 15 tailored questions + invite email  
8. **AI interview** — ~30 min voice session, Groq evaluation  
9. **HR AI review** — Pass or reject (Checkpoint 3)  
10. **Human panel** — Meet link + briefing emails to interviewers  
11. **Panel complete** — HR marks the round done  
12. **Final decision** — Offer or reject; candidate can accept or decline  

**Important:** Screening and interviews do **not** auto-reject candidates. Scores guide HR; humans decide at each gate.

### HR operations

| Module | What it does |
|--------|--------------|
| **Employees** | Profiles, salary, leave entitlements |
| **Attendance** | Check-in/out, leave requests (agent notifies HR) |
| **Payroll** | Generate payslips, PDF attachment, anomaly flags |
| **Performance** | KPIs, goals, promotion signals |
| **Screening** | Bulk resume upload for recruiters |
| **Analytics** | Hiring funnel and workforce metrics |
| **HR Chatbot** | Role-aware assistant (Groq when configured) |
| **Onboarding** | Offer letters, checklists, 30/60/90 plans |

---

## Who sees what

| Role | Typical day |
|------|-------------|
| **Management Admin** | Everything — analytics, payroll, users, ML training |
| **Senior Manager** | Team view, leave approval, can schedule interviews |
| **HR Recruiter** | Jobs, applications inbox, screening, interviews, offers |
| **Employee** | Attendance, leave, payslip, performance |
| **Candidate** | Job openings, applications, AI interview, offer response |

The sidebar and dashboard adapt to your role. Pages you can't access redirect you home.

---

## Architecture

```
NeuroHR AI/
├── frontend/          Next.js 14 + TypeScript + Tailwind
├── backend-express/   Express + MongoDB + JWT  ← main API
├── ml-service/        FastAPI — Groq pipelines, parsing, scoring
├── knowledgebase/     Org repos for JD generation
├── ml-models/         Trained .pkl artifacts
├── docs/              Flow guides
└── docker-compose.yml
```

```
Browser (:3000) → Express API (:8000) → ML Service (:8001) → MongoDB Atlas
                         ↓
              Gmail OAuth (HR + Agent) · Google Calendar (Meet links)
```

---

## Quick start

### Prerequisites

- **Node.js** 20+
- **Python** 3.11+
- **MongoDB Atlas** (or local MongoDB)
- **Groq API key** — required for JD generation, screening SOP, interview scoring, and most AI emails
- **Google OAuth** — for HR mail, agent mail, and Calendar/Meet (see below)
- **Redis** — optional (caching)
- **Tesseract** — optional, for scanned PDFs on Windows

### 1. Environment

```powershell
Copy-Item .env.example .env
# Set MONGODB_URL, JWT_SECRET, GROQ_API_KEY
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ML_URL=http://localhost:8001
```

| Variable | Required? | Notes |
|----------|-----------|-------|
| `MONGODB_URL` | Yes | Atlas connection string |
| `JWT_SECRET` | Yes | Strong random secret |
| `GROQ_API_KEY` | Yes | Core AI features depend on this |
| `KNOWLEDGEBASE_PATH` | For KB JD | Default `./knowledgebase` |
| `SMTP_USER` / `HR_EMAIL` | For mail | Identity only — sending uses OAuth |
| `AGENT_SMTP_USER` | For agent mail | Leave/reimbursement → HR |

### 2. Google mail & calendar (one-time)

From `backend-express/`:

```powershell
npm run auth:calendar   # HR: Calendar + Gmail (credentials.json → token.json)
npm run auth:agent      # Agent: Gmail (credentials-1.json → agent-token.json)
npm run verify:mail     # Confirm both accounts can send
```

### 3. Install & seed

```powershell
Set-Location backend-express; npm install; Set-Location ..
Set-Location ml-service; pip install -r requirements.txt; Set-Location ..
Set-Location frontend; npm install; Set-Location ..

Set-Location backend-express
npm run seed         # if DB is empty
npm run seed:force   # wipe and reload demo data
```

### 4. Run (three terminals)

```powershell
# ML — port 8001
Set-Location ml-service
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# API — port 8000
Set-Location backend-express
npm run dev

# Frontend — port 3000
Set-Location frontend
npm run dev
```

Open **http://localhost:3000**

### 5. Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@neurohr.com | admin123 |
| Senior Manager | manager@neurohr.com | manager123 |
| HR Recruiter | recruiter@neurohr.com | recruiter123 |
| Employee | employee@neurohr.com | employee123 |
| Candidate | candidate@neurohr.com | candidate123 |
| HR Admin | vaishaleeaiml@gmail.com | 123456 |

**Five-minute hiring demo:**

1. Log in as **recruiter** → Post Jobs → generate or approve a JD  
2. As **candidate** → Job Openings → apply with a matching resume  
3. As **recruiter** → Applications → review score → schedule AI interview  
4. As **candidate** → My Interview → complete before deadline  
5. As **recruiter** → Pass AI review → schedule human panel → mark complete → send offer  

Full story: [**docs/HIRING_FLOW.md**](./docs/HIRING_FLOW.md)

### Docker

```bash
docker-compose up --build
```

---

## Hiring at a glance

```
Post JD (from KB or manual)
       ↓
Candidate applies → Groq resume screen
       ↓
≥80%? → auto-shortlisted (HR still reviews everyone)
       ↓
HR shortlists → Schedule AI interview
       ↓
Candidate completes voice interview → Groq scores
       ↓
HR Pass / Reject (Checkpoint 3)
       ↓
Human panel → HR marks complete
       ↓
Offer or reject → Candidate accepts or declines
```

**Composite score** after interview: **80% screening + 20% AI interview** (headline number in the inbox).

---

## Email system

Two Gmail identities, both OAuth (no app passwords):

| Sender | Used for |
|--------|----------|
| **HR** (`SMTP_USER`) | Interview invites, offers, rejections, payslips |
| **Agent** (`AGENT_SMTP_USER`) | Leave requests, reimbursements, offer accept/decline → HR |

Payslip and leave notification emails use **responsive HTML templates** (reliable delivery). Offer letters and some HR emails still use Groq generation when the ML service is up.

---

## API base

`http://localhost:8000/api/v1` — JWT in `Authorization: Bearer <token>`

| Area | Key routes |
|------|------------|
| Jobs | `POST /jobs/generate-from-kb`, `POST /jobs/:id/approve`, `POST /jobs/:id/apply` |
| Applications | `GET /jobs/applications/inbox`, `PATCH /jobs/applications/:id/status` |
| Interviews | `POST /interviews/schedule`, `POST /interviews/:id/submit` |
| HR gates | `POST /jobs/applications/:id/ai-interview-decision`, `complete-human-interview`, `final-decision`, `offer-response` |
| HR ops | `POST /attendance/leave`, `POST /payroll/generate` |

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `&&` fails in PowerShell | Use `;` or run commands on separate lines |
| Resume upload fails | Ensure ML is on `:8001`; use text PDF/DOCX; enter email manually on Screening |
| Groq errors | Check `GROQ_API_KEY`; restart ml-service |
| Mail fails | Run `npm run auth:calendar` and `npm run auth:agent`; then `npm run verify:mail` |
| Payroll / leave "saved but email failed" | Payroll and leave still save — fix OAuth and retry |
| Leave request "Employee profile not found" | Log in as an employee whose email matches an Employee record |
| MongoDB connection error | Check `MONGODB_URL` and Atlas IP whitelist |

**Health checks:**

```powershell
Invoke-WebRequest http://localhost:8001/health
Invoke-WebRequest http://localhost:8000/api/v1/jobs
```

---

## UI theme

| Color | Hex | Use |
|-------|-----|-----|
| Aqua Blue | `#00B8B8` | Primary actions |
| Cream | `#FFF4DE` | Cards |
| Dark Teal | `#0D4F4F` | Headings, sidebar |

Glass cards, TipTap rich text, responsive emails, Framer Motion transitions.

---

## Security

- JWT auth with bcrypt passwords  
- Role-based access on routes and pages  
- Input validation on API  
- OAuth for Gmail — no stored app passwords  
- Secure file uploads via multer  

---

## License

Built for hackathon evaluation and demonstration.
