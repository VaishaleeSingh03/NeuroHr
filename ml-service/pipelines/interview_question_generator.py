"""Per-candidate interview questions when AI interview is scheduled — Groq-first with JD/resume fallback."""



import json

import logging



from pipelines.groq_service import GroqApiError, groq_json



logger = logging.getLogger(__name__)



DEFAULT_COUNT = 15





def _normalize_question(item: dict, index: int, total_minutes: int, count: int) -> dict:

    text = item.get("text") or item.get("question") or ""

    per_q = item.get("max_time_seconds") or max(60, (total_minutes * 60) // count)

    return {

        "id": item.get("index") or item.get("id") or index + 1,

        "index": item.get("index") or index + 1,

        "question": text,

        "text": text,

        "category": item.get("category") or item.get("type") or "technical",

        "type": item.get("category") or item.get("type") or "technical",

        "difficulty": item.get("difficulty") or "medium",

        "skill": item.get("skill_being_tested") or item.get("skill") or "",

        "skill_being_tested": item.get("skill_being_tested") or item.get("skill") or "",

        "rubric": item.get("rubric") or {},

        "follow_up": item.get("follow_up") or "",

        "max_time_seconds": per_q,

        "time_limit_seconds": per_q,

    }





def _build_fallback_questions(
    name: str,
    role_title: str,
    must_have: list,
    evidenced: list,
    gaps: list,
    count: int = DEFAULT_COUNT,
) -> list[dict]:
    """Deterministic JD/resume-tied questions when Groq JSON fails."""
    items: list[dict] = []

    def add(text: str, category: str, skill: str = "", difficulty: str = "medium") -> None:
        if len(items) >= count or not text.strip():
            return
        items.append({
            "index": len(items) + 1,
            "category": category,
            "difficulty": difficulty,
            "text": text.strip(),
            "question": text.strip(),
            "rubric": {
                "great": "Detailed, specific, JD-aligned answer with examples",
                "good": "Solid answer with some examples",
                "poor": "Vague or unrelated to the role",
            },
            "follow_up": "Can you walk me through a concrete example?",
            "max_time_seconds": 90,
            "skill_being_tested": skill or category,
        })

    add(
        f"Hi {name}, to start — what interests you most about the {role_title} role, "
        "and which part of your background is the strongest fit?",
        "warmup",
        difficulty="easy",
    )

    skills = [s for s in dict.fromkeys([*(must_have or []), *(evidenced or [])]) if s]
    for skill in skills:
        add(
            f"For this {role_title} position, the JD requires {skill}. "
            f"Tell me about a project where you used {skill} in production — what did you build and what trade-offs did you make?",
            "technical",
            skill=str(skill),
        )
        if len(items) >= count - 2:
            break

    for gap in (gaps or [])[:3]:
        add(
            f"The role also expects strength in {gap}. How have you developed or applied {gap} in your work so far?",
            "technical",
            skill=str(gap),
            difficulty="hard",
        )

    add(
        "Tell me about a time you debugged a difficult technical issue under deadline. What was your approach?",
        "behavioral",
    )
    add("What questions do you have for us about the team, the role, or the tech stack?", "wrapup", difficulty="easy")

    while len(items) < count and skills:
        skill = skills[len(items) % len(skills)]
        add(
            f"How would you evaluate whether {skill} is the right choice for a new feature on this team?",
            "technical",
            skill=str(skill),
        )

    return items[:count]


def generate_tailored_questions(

    candidate: dict,

    screening_result: dict,

    skills_matrix: dict,

    tech_stack_profile: dict | None = None,

    job_description: str = "",

    count: int = DEFAULT_COUNT,

) -> dict:

    """Generate tailored voice interview questions from resume + JD + screening (Groq-first, fallback on failure)."""

    if not job_description or not str(job_description).strip():
        raise GroqApiError("Job description is required to generate interview questions.")

    name = candidate.get("name") or "the candidate"

    skills = candidate.get("skills") or {}

    evidenced = skills.get("evidenced") or candidate.get("matched_skills") or []

    claimed = skills.get("claimed_only") or []

    projects = candidate.get("projects") or []

    work_history = candidate.get("work_history") or candidate.get("experience") or []

    resume_text = (candidate.get("resume_text") or candidate.get("resume_summary") or "").strip()
    strengths = screening_result.get("top_strengths") or []
    gaps = screening_result.get("key_gaps") or []
    screening_score = screening_result.get("total_score") or screening_result.get("ai_score") or 0
    role_title = skills_matrix.get("role_title") or "Position"

    must_have = [
        s.get("skill", s) if isinstance(s, dict) else s
        for s in skills_matrix.get("must_have", [])
    ]
    nice_to_have = [
        s.get("skill", s) if isinstance(s, dict) else s
        for s in skills_matrix.get("nice_to_have", [])
    ]

    compact_resume = resume_text[:1200] if resume_text else ""
    compact_jd = (job_description or "")[:1800]
    compact_stack = json.dumps(tech_stack_profile or {}, default=str)[:600]

    prompt = f"""Generate {count} tailored voice interview questions (spoken, natural language).

Role: {role_title} — {skills_matrix.get("experience_level", "2 years")}
Must-have: {must_have[:12]}
Nice-to-have: {nice_to_have[:8]}
Screening score: {screening_score}/100
Evidenced skills: {evidenced[:12]}
Claimed skills: {claimed[:8]}
Strengths: {strengths[:6]}
Gaps to probe: {gaps[:6]}
Projects: {json.dumps(projects[:2], default=str)[:500]}
Work: {json.dumps(work_history[:2], default=str)[:500]}
Resume excerpt: {compact_resume or "(use skills/projects above)"}
JD excerpt: {compact_jd}
Tech stack: {compact_stack}

Return JSON ONLY:
{{"candidate_name":"{name}","total_questions":{count},"estimated_duration_minutes":30,"questions":[{{"index":1,"category":"warmup|technical|behavioral|wrapup","difficulty":"easy|medium|hard","text":"question","rubric":{{"great":"...","good":"...","poor":"..."}},"follow_up":"...","max_time_seconds":90,"skill_being_tested":"skill"}}]}}

Rules: tie each question to JD + resume; probe gaps; 60%+ technical; no generic trivia; do NOT paste resume/JD text outside JSON strings."""

    generated_by = "groq"
    result = None
    try:
        result = groq_json(
            "Generate tailored voice interview questions. Output one JSON object with a questions array.",
            prompt,
            strict=False,
            max_tokens=4096,
            min_output_tokens=2048,
            token_budget=8000,
        )
    except GroqApiError as exc:
        logger.warning("Groq interview questions failed, using fallback: %s", exc)

    if not isinstance(result, dict) or not result.get("questions"):
        logger.warning("Groq returned no interview questions — using JD/resume fallback set")
        fallback = _build_fallback_questions(name, role_title, must_have, evidenced, gaps, count)
        result = {
            "candidate_name": name,
            "total_questions": len(fallback),
            "estimated_duration_minutes": 30,
            "questions": fallback,
        }
        generated_by = "fallback"

    est = result.get("estimated_duration_minutes", 30)
    normalized = []
    for i, q in enumerate(result["questions"][:count]):
        if not isinstance(q, dict):
            continue
        text = str(q.get("text") or q.get("question") or "").strip()
        if not text:
            continue
        normalized.append(_normalize_question(q, i, est, count))

    if not normalized:
        fallback = _build_fallback_questions(name, role_title, must_have, evidenced, gaps, count)
        normalized = [_normalize_question(q, i, 30, count) for i, q in enumerate(fallback)]
        generated_by = "fallback"

    logger.info("Generated %s tailored questions (%s) for %s", len(normalized), generated_by, name)
    return {
        "candidate_name": result.get("candidate_name", name),
        "total_questions": len(normalized),
        "estimated_duration_minutes": est,
        "questions": normalized,
        "generated_by": generated_by,
    }


