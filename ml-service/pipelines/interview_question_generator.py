"""Per-candidate interview questions when AI interview is scheduled — Groq only (no fallback)."""



import json

import logging



from pipelines.groq_service import GroqApiError, groq_json, require_groq



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





def generate_tailored_questions(

    candidate: dict,

    screening_result: dict,

    skills_matrix: dict,

    tech_stack_profile: dict | None = None,

    job_description: str = "",

    count: int = DEFAULT_COUNT,

) -> dict:

    """Generate tailored voice interview questions from resume + JD + screening (Groq only)."""

    require_groq()



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



    must_have = [

        s.get("skill", s) if isinstance(s, dict) else s

        for s in skills_matrix.get("must_have", [])

    ]

    nice_to_have = [

        s.get("skill", s) if isinstance(s, dict) else s

        for s in skills_matrix.get("nice_to_have", [])

    ]



    prompt = f"""Generate a technical interview question set for this candidate.

These questions will be asked by an AI voice interviewer — write them in natural spoken language.



=== ROLE & JD REQUIREMENTS ===

{skills_matrix.get("role_title", "Position")} — {skills_matrix.get("experience_level", "2 years")}

Must-have skills: {must_have}

Nice-to-have skills: {nice_to_have}



Job description:

{(job_description or "")[:3500]}



=== CANDIDATE RESUME & SCREENING ===

Name: {name}

Resume screening score: {screening_score}/100

Resume text excerpt:

{resume_text[:3000] if resume_text else "(see structured fields below)"}



Evidenced skills: {evidenced}

Claimed (unverified) skills: {claimed}

Key projects: {json.dumps(projects[:4], default=str)}

Work history: {json.dumps(work_history[:4], default=str)}

Screening strengths: {strengths}

Screening gaps to probe: {gaps}



Tech stack context:

{json.dumps(tech_stack_profile or {}, indent=2)[:1200]}



=== GENERATE {count} QUESTIONS ===



Return JSON only:

{{

    "candidate_name": "{name}",

    "total_questions": {count},

    "estimated_duration_minutes": 30,

    "questions": [

        {{

            "index": 1,

            "category": "warmup | technical | behavioral | wrapup",

            "difficulty": "easy | medium | hard",

            "text": "Natural spoken question tied to resume or JD",

            "rubric": {{

                "great": "9-10 answer",

                "good": "6-8 answer",

                "poor": "1-5 answer"

            }},

            "follow_up": "If answer is vague",

            "max_time_seconds": 90,

            "skill_being_tested": "React hooks"

        }}

    ]

}}



Rules:

- Every technical question must tie to JD requirements AND candidate resume/screening

- Natural speech ("Tell me about..." not "Describe the...")

- Reference their projects/work when possible

- Probe claimed-only skills and screening gaps

- Ramp difficulty: warmup → technical → behavioral → wrapup

- At least 60% technical for software roles

- No generic trivia"""



    result = groq_json(

        "You generate tailored voice interview questions from a candidate resume and job description.",

        prompt,

        strict=True,

    )



    if not isinstance(result, dict) or not result.get("questions"):

        raise GroqApiError("Groq returned no interview questions for this candidate and JD.")



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

        raise GroqApiError("Groq interview questions were empty after parsing.")



    logger.info("Generated %s tailored questions via Groq for %s", len(normalized), name)

    return {

        "candidate_name": result.get("candidate_name", name),

        "total_questions": len(normalized),

        "estimated_duration_minutes": est,

        "questions": normalized,

        "generated_by": "groq",

    }


