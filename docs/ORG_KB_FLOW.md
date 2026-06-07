# Org Knowledge Base + Email Flow

Your organization's real repos live in `knowledgebase/`. Groq reads them to write job descriptions that sound like your stack — not generic boilerplate.

This doc ties the KB to the 12-step hiring flow and explains how email fits in.

---

## Why a knowledge base?

Without it, JD generation guesses. With it, Agent 1 (KB pipeline) sees:

- Which frameworks you actually use (React, Express, FastAPI, MongoDB, …)  
- Past project domains (HR tech, ESG, agentic AI)  
- Repo-specific details from `catalog/*.md`  

Same idea as Ruh AI's org knowledgebase — adapted for NeuroHR with **Groq** instead of Codex.

---

## Folder layout

```
knowledgebase/
├── INDEX.md           # Org profile + repo table
└── catalog/
    ├── AI-Based-HR-Module.md
    ├── DigitalRecruiter.md
    ├── frontend_DR.md
    └── ...            # One file per repo / product
```

| Reader | File |
|--------|------|
| Load index + catalog | `ml-service/pipelines/knowledgebase.py` |
| Tech stack extraction | `ml-service/pipelines/repo_analyzer.py` |
| JD + questions | `ml-service/pipelines/jd_generator.py` |
| API | `POST /api/jd/generate-from-kb` → Express `POST /jobs/generate-from-kb` |

---

## Agent 1 pipeline (Groq)

1. **analyze_tech_stack** — scan catalog for the role  
2. **map_skills** — must-have vs nice-to-have from real repos  
3. **draft_jd** — seven-section Markdown JD  
4. **serialize_jd** — structured metadata + skills list  
5. **interview_questions** — seeds for later Groq question generation  

All steps need `GROQ_API_KEY` and `KNOWLEDGEBASE_PATH=./knowledgebase`.

---

## Hiring + email (end to end)

```
1. HR generates JD from KB        → Post Jobs
2. HR approves & posts            → Job Openings live
3. Candidate applies              → Groq resume SOP
   └─ ≥80% auto-shortlist (HR still reviews everyone)
4. HR schedules AI interview      → HR OAuth invite email
5. Candidate completes interview  → Groq eval; HR review pending
6. HR Pass / Reject               → email + notification
7. Human panel                    → Meet (Calendar OAuth) + briefing emails
8. HR marks panel complete
9. Offer or reject                → Groq offer letter (when ML up)
10. Candidate accept / decline    → Agent OAuth → HR
```

**HR operations (outside hiring):**

- **Payslip** — HR OAuth, HTML template + PDF (no Groq)  
- **Leave request** — Agent OAuth notifies HR (template, no Groq)  

---

## Environment

```env
GROQ_API_KEY=gsk-...
ORG_NAME=XYZ
KNOWLEDGEBASE_PATH=./knowledgebase
APP_URL=http://localhost:3000

# Mail identities (OAuth — not app passwords)
SMTP_USER=your-hr@gmail.com
HR_EMAIL=your-hr@gmail.com
AGENT_SMTP_USER=your-agent@gmail.com

GOOGLE_CALENDAR_CREDENTIALS=./credentials.json
GOOGLE_CALENDAR_TOKEN=./token.json
GOOGLE_AGENT_CREDENTIALS=./credentials-1.json
GOOGLE_AGENT_TOKEN=./agent-token.json
```

**One-time auth** (from `backend-express/`):

```powershell
npm run auth:calendar
npm run auth:agent
npm run verify:mail
```

Re-run `auth:calendar` if HR mail fails after scope changes — token must include Gmail + Calendar.

---

## Fresh database

```powershell
Set-Location backend-express
npm run seed:force
```

Creates HR admin `vaishaleeaiml@gmail.com` / `123456`. No jobs until you generate a JD from KB.

**First login flow:** Post Jobs → Generate JD from Knowledge Base → Approve → hire from there.

---

## Adding a new repo to the KB

1. Add `knowledgebase/catalog/YourRepo.md` — stack, features, integrations.  
2. Link it from `knowledgebase/INDEX.md` in the catalog table.  
3. Restart ML service (or let reload pick it up).  
4. Generate a JD — Groq should reference the new repo when relevant.

---

## Related

- [Full Hiring Flow](./FULL_HIRING_FLOW.md)  
- [ML Flow](./ML_FLOW.md) — pipeline internals  
- [knowledgebase/INDEX.md](../knowledgebase/INDEX.md) — org profile  
