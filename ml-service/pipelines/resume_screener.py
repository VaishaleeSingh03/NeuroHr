"""Resume screening — great-harness-agent style (fresher 10-step / experienced 8-step SOP), Groq only."""

from pipelines.harness_profile import normalize_to_harness_profile, candidate_type
from pipelines.fresher_screener import screen_fresher
from pipelines.experienced_screener import screen_experienced
from pipelines.llm_provider import require_llm
from pipelines.preprocessing import extract_skills_from_text


def build_job_context(job_title: str = "", job_description: str = "", job_skills: list | None = None) -> str:
    parts = []
    if job_title:
        parts.append(f"Job Title: {job_title}")
    if job_skills:
        parts.append(f"Required Skills: {', '.join(job_skills)}")
    if job_description:
        parts.append(f"Job Description:\n{job_description}")
    return "\n\n".join(parts)


def _infer_experience_level(job_title: str, job_description: str, stored_level: str = "") -> str:
    from pipelines.experience_utils import normalize_experience_level
    import re

    if stored_level:
        return normalize_experience_level(stored_level)
    text = f"{job_title} {job_description}".lower()
    year_match = re.search(r"(\d+(?:\.\d+)?)\s*\+?\s*years?", text)
    if year_match:
        n = float(year_match.group(1))
        return normalize_experience_level(
            f"{int(n) if n == int(n) else n}+ years" if "+" in year_match.group(0)
            else f"{int(n) if n == int(n) else n} years"
        )
    if any(w in text for w in ("senior", "lead", "principal", "8+ years", "10+ years")):
        return "5+ years"
    if any(w in text for w in ("junior", "entry", "graduate", "fresher", "0-2 years")):
        return "0-2 years"
    return "2 years"


def _build_jd_requirements(
    job_title: str,
    job_description: str,
    job_skills: list | None,
    stored_level: str = "",
    job_nice_to_have: list | None = None,
) -> dict:
    skills = list(job_skills or [])
    if not skills and job_description:
        skills = extract_skills_from_text(job_description)[:20]
    nice = list(job_nice_to_have or [])
    return {
        "role_title": job_title or "Role",
        "experience_level": _infer_experience_level(job_title, job_description, stored_level),
        "must_have": [{"skill": s, "category": "technical"} for s in skills],
        "nice_to_have": [{"skill": s, "category": "technical"} for s in nice],
        "frameworks": skills,
        "min_education": None,
        "internship_required": False,
        "description_excerpt": (job_description or "")[:2500],
    }


def _verdict_color_hint(verdict: str) -> str:
    v = (verdict or "").lower()
    if "priority" in v or "strong fit" in v:
        return "green"
    if "shortlisted" in v or "good fit" in v:
        return "blue"
    if "flagged" in v:
        return "amber"
    return "gray"


def _map_harness_to_response(
    profile: dict, screening_result: dict, ctype: str, jd_req: dict,
) -> dict:
    total = float(screening_result.get("total_score") or 0)
    verdict = screening_result.get("verdict") or "Flagged for Review"
    dim = screening_result.get("dimension_scores") or {}
    if not isinstance(dim, dict):
        dim = {}
    skills_dim = dim.get("skills_match") or dim.get("technical_skills_match") or {}
    if not isinstance(skills_dim, dict):
        skills_dim = {}

    required = [
        s.get("skill") if isinstance(s, dict) else str(s)
        for s in (jd_req.get("must_have") or [])
        if s
    ]
    gaps = list(screening_result.get("key_gaps") or [])
    strengths = list(screening_result.get("top_strengths") or [])
    matched = list(screening_result.get("matched_skills") or strengths)

    return {
        "ai_score": round(total, 2),
        "total_score": round(total, 2),
        "max_score": screening_result.get("max_score", 100),
        "verdict": verdict,
        "recommendation": verdict,
        "candidate_type": ctype,
        "procedure": screening_result.get("procedure"),
        "escalate_to_human": bool(screening_result.get("escalate_to_human")),
        "red_flags": screening_result.get("red_flags") or [],
        "top_strengths": strengths,
        "key_gaps": gaps,
        "strengths": strengths,
        "gaps": gaps,
        "whats_good": strengths,
        "whats_bad": gaps,
        "decision_note": screening_result.get("decision_note") or "",
        "jd_fit_summary": screening_result.get("decision_note") or "",
        "dimension_scores": dim,
        "eligibility": screening_result.get("eligibility"),
        "work_experience_analysis": screening_result.get("work_experience_analysis"),
        "screening_result": screening_result,
        "harness_profile": {
            "name": profile.get("name"),
            "total_experience_years": profile.get("total_experience_years"),
            "repo_urls": profile.get("repo_urls", []),
        },
        "verdict_hint": _verdict_color_hint(verdict),
        "skill_match": {
            "matched": matched,
            "percentage": skills_dim.get("match_pct") or 0,
            "required": required,
        },
        "missing_skills": gaps,
        "feature_scores": dim,
        "extracted_summary": {
            "name": profile.get("name"),
            "email": profile.get("email"),
            "skills": (profile.get("skills") or {}).get("all_listed", [])[:15]
            if isinstance(profile.get("skills"), dict)
            else profile.get("skills", [])[:15],
            "experience_years": profile.get("total_experience_years"),
        },
        "screening_engine": "groq_harness_sop",
    }


def screen_resume_against_jd(
    parsed_resume: dict,
    job_description: str,
    job_title: str = "",
    job_skills: list | None = None,
    job_experience_level: str = "2 years",
    job_nice_to_have: list | None = None,
) -> dict:
    require_llm()
    profile = normalize_to_harness_profile(parsed_resume)
    jd_req = _build_jd_requirements(
        job_title, job_description, job_skills, job_experience_level, job_nice_to_have,
    )
    ctype = candidate_type(profile, jd_req["experience_level"])

    if ctype == "experienced":
        screening_result = screen_experienced(profile, jd_req)
    else:
        screening_result = screen_fresher(profile, jd_req)

    return _map_harness_to_response(profile, screening_result, ctype, jd_req)
