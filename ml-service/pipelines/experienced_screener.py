"""Experienced candidate screening — 8-step SOP (great-harness-agent), Groq only."""

import logging

from pipelines.groq_service import groq_screening_json
from pipelines.screening_utils import (
    candidate_json,
    compact_jd_payload,
    normalize_screening_result,
)

logger = logging.getLogger(__name__)


def screen_experienced(candidate: dict, jd_requirements: dict) -> dict:
    logger.info("Experienced screening: %s", candidate.get("name", "unknown"))
    name = candidate.get("name", "unknown")

    prompt = (
        "Screen this EXPERIENCED candidate resume against the JD. "
        "Focus on work depth, tech match, impact, and career fit.\n\n"
        f"=== JD ===\n{compact_jd_payload(jd_requirements)}\n\n"
        f"=== CANDIDATE ===\n{candidate_json(candidate)}\n\n"
        "8-step SOP: experience verification, role relevance, technical skills depth, "
        "project/work impact, education, certifications, trajectory, resume quality.\n"
        "Verdict bands: 75-100 Shortlisted Strong Fit; 55-74 Shortlisted Good Fit; "
        "40-54 Flagged for Review (escalate_to_human=true, never auto-reject); "
        "below 40 Not Shortlisted.\n\n"
        "Return JSON: procedure, experience_verification, work_experience_analysis, "
        "dimension_scores (technical_skills_match with match_pct, experience_relevance, "
        "impact, education, trajectory — each score/max/notes), total_score (0-100), "
        "max_score (100), verdict, red_flags, auto_escalate_reasons, decision_note "
        "(what is strong vs weak for this JD), escalate_to_human, top_strengths (string[]), "
        "key_gaps (string[]), matched_skills (string[] of JD skills evidenced in resume).\n"
        'Example shape: {"total_score":68,"max_score":100,"verdict":"Shortlisted Good Fit",'
        '"decision_note":"...","top_strengths":[],"key_gaps":[],"matched_skills":[],'
        '"dimension_scores":{},"escalate_to_human":false}'
    )

    result = groq_screening_json(
        "Expert HR experienced technical screener. Output one JSON object only.",
        prompt,
    )

    parsed = normalize_screening_result(result, "experienced_8step", name)
    if parsed.get("auto_escalate_reasons"):
        parsed["escalate_to_human"] = True
    score = parsed["total_score"]
    if 40 <= score < 55:
        parsed["escalate_to_human"] = True
        if parsed.get("verdict") == "Not Shortlisted":
            parsed["verdict"] = "Flagged for Review"

    logger.info(
        "Experienced %s → %s/100 → %s",
        name,
        score,
        parsed.get("verdict", "?"),
    )
    return parsed
