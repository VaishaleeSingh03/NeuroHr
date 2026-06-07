# XYZ — Organization Knowledge Base

**Who we are:** XYZ builds AI-powered products — HR tech, full-stack SaaS, ESG platforms, and agentic systems.

**Why this folder exists:** NeuroHR AI reads these files when HR clicks **Generate JD from Knowledge Base**. The more accurate your catalog entries, the more realistic your job posts and interview questions.

---

## What we build

| Area | Examples in our repos |
|------|------------------------|
| **HR & recruitment** | Digital recruiting, resume screening, AI interviews |
| **Agentic AI** | Mentor agents, task automation, LLM orchestration |
| **Full-stack SaaS** | Next.js frontends, Express backends, MongoDB |
| **ESG & analytics** | Sustainability reporting |
| **ML pipelines** | FastAPI, scikit-learn, Groq/OpenAI integrations |

---

## Catalog — repos the agent can read

| Repo | Stack (summary) | Domain |
|------|-----------------|--------|
| [AI-Based-HR-Module](./catalog/AI-Based-HR-Module.md) | Next.js, Express, FastAPI, Groq, MongoDB | NeuroHR AI — this platform |
| [DigitalRecruiter](./catalog/DigitalRecruiter.md) | React, Node, ML screening | Recruitment automation |
| [frontend_DR](./catalog/frontend_DR.md) | React, Tailwind | Recruiter UI |
| [backend_DR](./catalog/backend_DR.md) | Node, Express, MongoDB | Recruiter API |
| [ModuMentorServer](./catalog/ModuMentorServer.md) | Python, agents, LLM | Mentor / learning agents |
| [ModumentorAgent-](./catalog/ModumentorAgent-.md) | Agent orchestration | Task automation |
| [BreatheESG](./catalog/BreatheESG.md) | Full-stack, analytics | ESG reporting |
| [tech_task_management_fe](./catalog/tech_task_management_fe.md) | React frontend | Task management UI |
| [tech_task_management_be](./catalog/tech_task_management_be.md) | Node backend | Task management API |

Each `catalog/*.md` file should describe: purpose, tech stack, key features, and integrations. Keep them honest — the JD generator quotes this material.

---

## How NeuroHR uses this

1. **Post Jobs** — recruiter picks role + department  
2. **Groq** reads `INDEX.md` + relevant catalog files  
3. **Draft JD** saved until HR approves  
4. **Screening & interviews** use the same JD context for scoring  

Path config: `KNOWLEDGEBASE_PATH=./knowledgebase` in `.env`.

---

## Maintaining the KB

- Add a new markdown file under `catalog/` when you start a significant repo  
- Update the table above with a one-line summary  
- Prefer concrete stack names (e.g. "Express 4, Mongoose 8") over vague "modern backend"  
- After large edits, regenerate a test JD to sanity-check output  

For the full hiring path, see [docs/FULL_HIRING_FLOW.md](../docs/FULL_HIRING_FLOW.md).
