# NeuroHR AI — Documentation

Welcome. This folder explains how NeuroHR AI actually works — in plain language, for developers, demo presenters, and coding agents.

---

## Read in this order

| Doc | Who it's for | What you'll get |
|-----|--------------|-----------------|
| [**Full Hiring Flow**](./FULL_HIRING_FLOW.md) | Everyone building or demoing hiring | All **12 steps** — pages, APIs, gates |
| [**Hiring Flow**](./HIRING_FLOW.md) | Recruiters, candidates, presenters | Story-style walkthrough |
| [**Org KB Flow**](./ORG_KB_FLOW.md) | Anyone using KB JD generation | How `knowledgebase/` feeds Groq |
| [**ML Flow**](./ML_FLOW.md) | ML / backend engineers | Pipelines, Groq, scoring |
| [**Agent Flow**](./AGENT_FLOW.md) | Cursor & contributors | File map, don't-break rules |

**From the repo root:**

- [README](../README.md) — install, run, accounts  
- [DEPLOYMENT](../DEPLOYMENT.md) — Docker and production  

---

## The big picture (30 seconds)

Three services, one database:

```
Browser (Next.js)  →  Express API  →  Python ML Service
                            ↓
                      MongoDB Atlas
```

- **Frontend** — role-based dashboards; clickable 12-step hiring pipeline  
- **Express** — auth, jobs, applications, interviews, payroll, leave, notifications  
- **ML service** — Groq for JD, screening SOP, interview eval; parsing and training too  

**Philosophy:** AI scores and drafts; **HR decides** at checkpoints. Strong screening (≥80%) auto-shortlists — it does not auto-reject.

---

## The 12-step pipeline (names only)

1. KB Analysis → 2. JD Draft → 3. Approve & Post → 4. Apply → 5. Resume Screen → 6. HR Screening → 7. Schedule AI Interview → 8. AI Interview → 9. HR AI Review → 10. Human Panel → 11. Panel Complete → 12. Final Decision  

Details: [FULL_HIRING_FLOW.md](./FULL_HIRING_FLOW.md)

---

## Email (quick note)

- **HR OAuth** — interviews, offers, payslips → candidates/employees  
- **Agent OAuth** — leave, reimbursements, offer responses → HR  
- Payslips and leave use **static HTML templates** so payroll/HR ops don't depend on Groq token limits  

Setup: `npm run auth:calendar`, `npm run auth:agent`, `npm run verify:mail` in `backend-express/`.

---

## Running locally

Three terminals — ML `8001`, Express `8000`, frontend `3000`. See [README § Quick start](../README.md#quick-start).
