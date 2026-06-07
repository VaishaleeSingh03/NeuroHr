# AI-Based-HR-Module (NeuroHR AI)

**Type:** Enterprise HRMS + AI recruitment platform  
**Stack:** Next.js 14, Express.js, Python FastAPI, MongoDB Atlas, Groq  
**Owner:** XYZ

## What it is

NeuroHR AI is XYZ's flagship HR platform: hire people with a 12-step pipeline (KB → JD → screen → AI interview → human panel → offer), then run day-to-day HR — attendance, leave, payroll, performance, analytics.

AI scores candidates; HR approves at each checkpoint. Strong resumes (≥80% JD match) auto-shortlist without auto-rejecting anyone.

## Architecture

```
frontend/ (Next.js :3000) → backend-express/ (:8000) → ml-service/ FastAPI (:8001) → MongoDB Atlas
                                      ↓
                        Gmail OAuth (HR + Agent) · Google Calendar (Meet)
```

## Key modules

- **Hiring:** KB-grounded JD (Groq), harness resume SOP, 15-question AI interviews, human panel + Meet links, offer accept/decline
- **Screening:** Bulk resume upload for recruiters
- **HR ops:** Check-in/out, leave (agent notifies HR), payroll with PDF payslips, anomaly flags
- **ML:** Custom CSV training → `.pkl` models; Groq for eval and most generative tasks
- **Comms:** Responsive HTML emails; dual OAuth mail (HR + Agent)
- **Analytics:** Hiring funnel, workforce predictions

## Skills used daily

- Next.js, TypeScript, Tailwind, Framer Motion
- Express, Mongoose, JWT, Socket.IO, nodemailer + Google OAuth
- Python FastAPI, Groq API, scikit-learn, resume parsing
- MongoDB Atlas, REST API design
- Google Calendar API for interview Meet links

## Hiring relevance

Primary codebase for full-stack, ML engineer, and HR-tech roles at XYZ. JD generation from this catalog should mention Groq-first AI, 12-step hiring, and Express + FastAPI split.
