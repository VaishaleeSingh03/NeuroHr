import re
from pipelines.preprocessing import extract_skills_from_text
from pipelines.llm_service import is_available, chat_completion


def process_chat_message(message: str, context: dict) -> dict:
    candidates = context.get("candidates", []) or []
    role = context.get("role", "employee")
    extra_context = context.get("text", "")

    if is_available():
        candidate_summary = "\n".join(
            f"- {c['name']}: score={c.get('ai_score', 0)}%, skills={', '.join(c.get('skills', [])[:5])}, status={c.get('status')}"
            for c in candidates[:15]
        ) or "No candidate records loaded."
        system = (
            "You are NeuroHR AI Assistant — an enterprise HR and recruitment copilot. "
            "Answer clearly using the provided HR context and candidate data. Be concise and actionable."
        )
        if role == "candidate":
            system += (
                " You are helping a job candidate with applications, interview preparation, "
                "and career advice. Do not discuss other candidates or internal employee comparisons."
            )
            user_prompt = f"User role: {role}\nContext: {extra_context}\n\nUser message: {message}"
        elif role == "employee":
            system += " You are helping an employee with career, attendance, payroll, and HR policy questions."
            user_prompt = f"User role: {role}\nContext: {extra_context}\n\nUser message: {message}"
        else:
            system += " You are helping a recruiter or manager with hiring, screening, and interviews."
            user_prompt = (
                f"User role: {role}\nContext: {extra_context}\n\n"
                f"Candidates in system:\n{candidate_summary}\n\nUser message: {message}"
            )

        llm_response = chat_completion(system, user_prompt)
        if llm_response:
            return {
                "response": llm_response,
                "reply": llm_response,
                "action": "llm",
                "sources": candidates[:5],
            }

    message_lower = message.lower()

    if role == "candidate":
        return _handle_candidate_message(message, message_lower, extra_context)

    if role == "employee":
        return _handle_employee_message(message, message_lower, extra_context)

    if any(kw in message_lower for kw in ["find", "search", "best", "top", "developers", "candidates"]):
        return _handle_search(message, candidates)

    if "compare" in message_lower:
        return _handle_compare(message, candidates)

    if any(kw in message_lower for kw in ["reject", "rejection", "decline"]):
        return _handle_rejection_email(message, candidates)

    if any(kw in message_lower for kw in ["onboard", "onboarding", "joining"]):
        return _handle_onboarding_plan(message, candidates)

    if any(kw in message_lower for kw in ["interview", "questions"]):
        return _handle_interview_help(message)

    return _handle_general(message, candidates, role)


def _handle_search(message: str, candidates: list) -> dict:
    skills = extract_skills_from_text(message)
    filtered = candidates

    if skills:
        filtered = [
            c for c in candidates
            if any(s.lower() in " ".join(c.get("skills", [])).lower() for s in skills)
        ]

    filtered = sorted(filtered, key=lambda x: x.get("ai_score", 0), reverse=True)[:10]

    if not filtered:
        text = "No candidates found matching your criteria. Try broadening your search or upload more resumes."
        return {"response": text, "reply": text, "action": "search", "sources": []}

    lines = [f"**Top {len(filtered)} Candidates:**\n"]
    for i, c in enumerate(filtered, 1):
        skills_str = ", ".join(c.get("skills", [])[:5])
        lines.append(
            f"{i}. **{c['name']}** — AI Score: {c.get('ai_score', 0):.0f}% | Skills: {skills_str}"
        )

    text = "\n".join(lines)
    return {
        "response": text,
        "reply": text,
        "action": "search",
        "sources": [{"name": c["name"], "score": c.get("ai_score", 0)} for c in filtered],
    }


def _handle_compare(message: str, candidates: list) -> dict:
    match = re.search(r"top\s*(\d+)", message_lower := message.lower())
    n = int(match.group(1)) if match else 5
    top = sorted(candidates, key=lambda x: x.get("ai_score", 0), reverse=True)[:n]

    if not top:
        text = "No candidates available for comparison."
        return {"response": text, "reply": text, "action": "compare"}

    lines = [f"**Comparison of Top {len(top)} Candidates:**\n"]
    lines.append("| Candidate | AI Score | Top Skills | Status |")
    lines.append("|-----------|----------|------------|--------|")
    for c in top:
        skills = ", ".join(c.get("skills", [])[:3])
        lines.append(f"| {c['name']} | {c.get('ai_score', 0):.0f}% | {skills} | {c.get('status', 'N/A')} |")

    best = top[0]
    lines.append(f"\n**Recommendation:** {best['name']} leads with {best.get('ai_score', 0):.0f}% AI match score.")

    text = "\n".join(lines)
    return {"response": text, "reply": text, "action": "compare", "sources": top}


def _handle_rejection_email(message: str, candidates: list) -> dict:
    name_match = re.search(r"for\s+(\w+)", message.lower())
    name = name_match.group(1).title() if name_match else "Candidate"

    email = f"""Subject: Application Update — Thank You for Your Interest

Dear {name},

Thank you for taking the time to apply and participate in our recruitment process. We truly appreciate your interest in joining our team.

After careful consideration, we have decided to move forward with other candidates whose qualifications more closely align with our current requirements.

We were impressed by your background and encourage you to apply for future positions that match your skills. We will keep your profile on file for upcoming opportunities.

We wish you all the best in your career journey.

Warm regards,
TalentAI Nexus Recruitment Team"""

    return {"response": email, "reply": email, "action": "generate_email", "sources": None}


def _handle_onboarding_plan(message: str, candidates: list) -> dict:
    selected = [c for c in candidates if c.get("status") in ("selected", "onboarding")]
    name = selected[0]["name"] if selected else "New Hire"

    plan = f"""**Onboarding Plan for {name}**

**Week 1: Orientation**
- Company introduction and culture immersion
- IT setup and tool access provisioning
- Meet the team and buddy assignment
- Review role expectations and 90-day goals

**Week 2-4: Foundation**
- Complete mandatory compliance training
- Shadow team members on current projects
- Begin first assigned tasks with mentor support
- Weekly 1:1 check-ins with manager

**Day 30 Milestone:**
- Deliver first independent contribution
- Complete skills gap assessment
- Set Q2 development objectives

**Day 60 Milestone:**
- Lead a small feature or initiative
- Cross-functional collaboration project
- Mid-point performance review

**Day 90 Milestone:**
- Full productivity expected
- 360-degree feedback collection
- Career development plan finalized"""

    return {"response": plan, "reply": plan, "action": "onboarding_plan", "sources": None}


def _handle_interview_help(message: str) -> dict:
    skills = extract_skills_from_text(message)
    skill = skills[0] if skills else "the role"

    text = f"""**Suggested Interview Questions for {skill}:**

1. Describe your most complex project involving {skill}.
2. What trade-offs did you consider in your architectural decisions?
3. How do you approach debugging production issues?
4. Explain a time you had to learn a new technology quickly.
5. How do you ensure code quality and maintainability?"""
    return {"response": text, "reply": text, "action": "interview_questions"}


def _handle_candidate_message(message: str, message_lower: str, context: str) -> dict:
    if any(kw in message_lower for kw in ["interview", "prepare", "ai interview", "camera", "mic"]):
        text = """**AI Interview preparation tips:**

1. Test camera and microphone before the deadline.
2. Use a quiet room with good lighting and a plain background.
3. Read each question carefully — answers are scored against the job description.
4. Speak clearly for 30–60 seconds per question with concrete examples.
5. You get **one attempt per role** — finish before the recruiter's deadline.

Join from **My Interview** when your recruiter schedules a session."""
        return {"response": text, "reply": text, "action": "interview_prep"}

    if any(kw in message_lower for kw in ["apply", "application", "submit", "after i apply", "status"]):
        text = """**Application process:**

1. Browse **Job Openings** and upload your resume.
2. AI screens your resume against the job description.
3. A recruiter reviews your application in their inbox.
4. If shortlisted, you'll get a notification and an AI interview may be scheduled.
5. Track status on your dashboard and in notifications."""
        if context:
            text += f"\n\n**Your status:** {context}"
        return {"response": text, "reply": text, "action": "application_help"}

    if any(kw in message_lower for kw in ["resume", "cv", "skills", "highlight"]):
        skills = extract_skills_from_text(message)
        skill_hint = f" Emphasize: {', '.join(skills[:5])}." if skills else ""
        text = f"""**Resume tips:**

- Tailor skills to the job description.{skill_hint}
- Use a text-based PDF or DOCX (not a scanned image).
- Lead with measurable outcomes and technologies from the posting.
- Keep contact email the same as your login account."""
        return {"response": text, "reply": text, "action": "resume_tips"}

    if any(kw in message_lower for kw in ["score", "scored", "calculated", "result"]):
        text = """**How interview scores work:**

Your AI interview is scored on technical depth, JD alignment, communication, confidence, and voice clarity. Recruiters see the overall score and recommendation after you submit. You can view your own results once analysis completes."""
        return {"response": text, "reply": text, "action": "scoring_help"}

    text = """I'm your **Career Assistant**. I can help with:

- **Interview prep:** "How do I prepare for my AI interview?"
- **Applications:** "What happens after I submit an application?"
- **Resume:** "Tips to improve my resume for tech roles"
- **Scores:** "How are interview scores calculated?"

What would you like help with?"""
    return {"response": text, "reply": text, "action": "help"}


def _handle_employee_message(message: str, message_lower: str, context: str) -> dict:
    if any(kw in message_lower for kw in ["leave", "vacation", "time off", "pto"]):
        text = """**Leave requests:** Go to **Attendance** to submit leave. Include dates and reason. Your manager will review and you'll receive a notification when it's approved or declined."""
        return {"response": text, "reply": text, "action": "leave_help"}

    if any(kw in message_lower for kw in ["payslip", "payroll", "salary", "pay"]):
        text = """**Payslips:** Open **Salary** from your dashboard to view monthly payslips, deductions, and net pay. Contact HR if a component looks incorrect."""
        return {"response": text, "reply": text, "action": "payroll_help"}

    if any(kw in message_lower for kw in ["performance", "review", "kpi", "goal"]):
        text = """**Performance:** Check **Performance** for KPIs, goals, and AI growth insights. Prepare examples of impact before review meetings and note skills you want to develop next quarter."""
        return {"response": text, "reply": text, "action": "performance_help"}

    if any(kw in message_lower for kw in ["grow", "career", "promotion", "training"]):
        text = """**Career growth:** Review skill gaps on your performance page, ask your manager for stretch projects, and use NeuroHR training recommendations. Consistent delivery and upskilling improve promotion readiness."""
        if context:
            text += f"\n\n**Your profile:** {context}"
        return {"response": text, "reply": text, "action": "career_help"}

    text = """I'm your **Career Assistant**. I can help with:

- **Leave:** "How do I request leave?"
- **Payroll:** "Explain my payslip components"
- **Performance:** "Tips to improve my performance review"
- **Growth:** "Career growth advice for my role"

How can I help?"""
    return {"response": text, "reply": text, "action": "help"}


def _handle_general(message: str, candidates: list, role: str = "hr_recruiter") -> dict:
    if role == "senior_manager":
        text = """I'm your NeuroHR Assistant for managers. I can help with:

- **Pipeline:** "Summarize our hiring pipeline"
- **Candidates:** "Who are the strongest applicants?"
- **Interviews:** "Interview preparation tips for managers"
- **Team:** "Team attendance overview"

How can I assist you?"""
        return {"response": text, "reply": text, "action": "help"}

    text = f"""I'm your NeuroHR AI Assistant. I can help you with:

- **Find candidates:** "Find best Python developers"
- **Compare:** "Compare top 5 candidates"
- **Emails:** "Generate rejection email for John"
- **Onboarding:** "Prepare onboarding plan"
- **Interviews:** "Generate interview questions for ML role"

You currently have **{len(candidates)}** candidates in the system. How can I assist you?"""
    return {"response": text, "reply": text, "action": "help"}
