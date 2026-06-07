"""Fresher resume screening — 10-step SOP (great-harness-agent), Groq only."""

import logging

from config import get_settings
from pipelines.groq_service import groq_json, GroqApiError

_settings = get_settings()
from pipelines.screening_utils import (
    candidate_json,
    compact_jd_payload,
    normalize_screening_result,
)

logger = logging.getLogger(__name__)


def screen_fresher(candidate: dict, jd_requirements: dict) -> dict:
    logger.info("Fresher screening: %s", candidate.get("name", "unknown"))
    name = candidate.get("name", "unknown")

    prompt = (
        "Screen this FRESHER resume against the JD. Score only what is clearly written.\n\n"
        f"=== JD ===\n{compact_jd_payload(jd_requirements)}\n\n"
        f"=== CANDIDATE ===\n{candidate_json(candidate)}\n\n"
        "Apply 10-step fresher SOP (eligibility, education, skills match, projects, "
        "internships, certs, initiative, resume quality). Dimension max scores: "
        "education 15, skills 25, internship 20, projects 15, certs 10, initiative 10, quality 5.\n"
        "Evidenced skills = full credit; claimed-only = half credit.\n"
        "Verdict bands: 80-100 Priority Shortlist; 60-79 Shortlisted; "
        "45-59 Flagged for Review (escalate_to_human=true); below 45 Not Shortlisted.\n\n"
        "Return JSON: procedure, eligibility, dimension_scores (each: score, max, notes; "
        "skills_match also match_pct), total_score (0-100), max_score (100), verdict, "
        "red_flags, decision_note (2-3 lines: what is good + what is weak vs JD), "
        "escalate_to_human, top_strengths (string[]), key_gaps (string[]), "
        "matched_skills (string[] of JD skills evidenced in resume).\n"
        'Example shape: {"total_score":72,"max_score":100,"verdict":"Shortlisted",'
        '"decision_note":"...","top_strengths":[],"key_gaps":[],"matched_skills":[],'
        '"dimension_scores":{},"escalate_to_human":false}'
    )

    result = groq_json(
        "Expert HR fresher screener. Output one JSON object only.",
        prompt,
        model=_settings.groq_model_strong,
        strict=True,
        max_tokens=2048,
    )
    if not isinstance(result, dict):
        raise GroqApiError("Groq fresher screening returned non-object JSON.")

    parsed = normalize_screening_result(result, "fresher_10step", name)
    if 45 <= parsed["total_score"] < 60:
        parsed["escalate_to_human"] = True
    if parsed.get("red_flags"):
        parsed["escalate_to_human"] = True

    logger.info(
        "Fresher %s → %s/100 → %s",
        name,
        parsed["total_score"],
        parsed.get("verdict", "?"),
    )
    return parsed
