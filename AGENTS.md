# Agent instructions

You're working on **NeuroHR AI** — Next.js + Express + FastAPI, Groq-first AI, dual Gmail OAuth.

**Start here:** [docs/AGENT_FLOW.md](./docs/AGENT_FLOW.md) — file map, 12-step hiring rules, demo accounts, safe change patterns.

**Flow docs:**

- [Full Hiring Flow](./docs/FULL_HIRING_FLOW.md) — 12 steps with APIs  
- [Hiring Flow](./docs/HIRING_FLOW.md) — human-readable walkthrough  
- [ML Flow](./docs/ML_FLOW.md) — Groq pipelines and scoring  
- [Org KB Flow](./docs/ORG_KB_FLOW.md) — knowledge base → JD  

**Active API:** `backend-express/` (ignore legacy `backend/`).  
**Run:** ML `:8001`, Express `:8000`, Frontend `:3000`.  
**Mail:** `npm run auth:calendar` + `npm run auth:agent` in `backend-express/`.  
**Do not commit** unless asked. **Never commit `.env` or OAuth token JSON.**
