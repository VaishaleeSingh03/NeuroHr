"""Shared helpers for Groq resume screening (great-harness-agent style)."""

import json

_JSON = {"separators": (",", ":")}


def compact_candidate_payload(candidate: dict) -> dict:
    skills = candidate.get("skills") if isinstance(candidate.get("skills"), dict) else {}
    return {
        "name": candidate.get("name"),
        "experience_years": candidate.get("total_experience_years", 0),
        "education": (candidate.get("education") or [])[:3],
        "work_history": (candidate.get("work_history") or [])[:4],
        "internships": (candidate.get("internships") or [])[:3],
        "skills_evidenced": (skills.get("evidenced") or [])[:15],
        "skills_claimed": (skills.get("claimed_only") or [])[:10],
        "projects": (candidate.get("projects") or [])[:4],
        "certifications": (candidate.get("certifications") or [])[:5],
        "repos": (candidate.get("repo_urls") or [])[:3],
        "resume_excerpt": (candidate.get("_raw_text") or "")[:800],
    }


def compact_jd_payload(jd_requirements: dict) -> str:
    must = [
        s.get("skill", s) if isinstance(s, dict) else s
        for s in (jd_requirements.get("must_have") or [])
    ]
    nice = [
        s.get("skill", s) if isinstance(s, dict) else s
        for s in (jd_requirements.get("nice_to_have") or [])
    ]
    parts = [
        f"Role: {jd_requirements.get('role_title', 'Role')}",
        f"Experience: {jd_requirements.get('experience_level', '2 years')}",
        f"Must-have: {', '.join(must[:12]) or 'see JD'}",
        f"Nice-to-have: {', '.join(nice[:8]) or 'none listed'}",
    ]
    excerpt = (jd_requirements.get("description_excerpt") or "").strip()
    if excerpt:
        parts.append(f"JD excerpt:\n{excerpt[:800]}")
    return "\n".join(parts)


def candidate_json(candidate: dict) -> str:
    return json.dumps(compact_candidate_payload(candidate), **_JSON, default=str)


def normalize_screening_result(result: dict, procedure: str, candidate_name: str) -> dict:
    from pipelines.groq_service import GroqApiError

    if not isinstance(result, dict):
        raise GroqApiError("Groq screening returned invalid response.")

    score = result.get("total_score")
    if score is None:
        dims = result.get("dimension_scores")
        if isinstance(dims, dict) and dims:
            try:
                derived = sum(
                    float(item.get("score", 0))
                    for item in dims.values()
                    if isinstance(item, dict) and item.get("score") is not None
                )
                if derived > 0:
                    result["total_score"] = derived
                    score = derived
            except (TypeError, ValueError):
                pass
    if score is None:
        raise GroqApiError("Groq screening response missing total_score.")
    try:
        result["total_score"] = float(score)
    except (TypeError, ValueError) as exc:
        raise GroqApiError(f"Groq screening returned invalid total_score: {score!r}") from exc

    result["max_score"] = int(result.get("max_score") or 100)
    result["procedure"] = procedure
    result["candidate_name"] = candidate_name
    result.setdefault("verdict", "Flagged for Review")
    result.setdefault("decision_note", "")
    result.setdefault("top_strengths", [])
    result.setdefault("key_gaps", [])
    result.setdefault("matched_skills", [])
    result.setdefault("red_flags", [])
    dims = result.get("dimension_scores")
    if isinstance(dims, list):
        mapped = {}
        for item in dims:
            if isinstance(item, dict):
                key = item.get("dimension") or item.get("name") or item.get("key")
                if key:
                    mapped[str(key).lower().replace(" ", "_")] = item
        result["dimension_scores"] = mapped
    elif not isinstance(dims, dict):
        result["dimension_scores"] = {}
    result.setdefault("escalate_to_human", False)

    if not result["decision_note"] and (result["top_strengths"] or result["key_gaps"]):
        good = "; ".join(result["top_strengths"][:3])
        bad = "; ".join(result["key_gaps"][:3])
        result["decision_note"] = f"Strengths: {good or '—'}. Gaps: {bad or '—'}."

    return result
