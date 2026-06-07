"""Harness-style holistic interview evaluation (great-harness-agent interview_eval.py, Groq)."""

import json
import logging

from pipelines.groq_service import GroqApiError, groq_json, require_groq

logger = logging.getLogger(__name__)

# Reference weights from interview_eval.py
DIMENSION_WEIGHTS = {
    "technical_knowledge": 0.35,
    "problem_solving": 0.25,
    "communication": 0.20,
    "culture_fit": 0.10,
    "experience_depth": 0.10,
}


def _build_transcript_text(transcript: list | str, answers: list | None = None) -> str:
    if isinstance(transcript, str) and transcript.strip():
        return transcript[:8000]
    lines = []
    if isinstance(transcript, list):
        for msg in transcript:
            if isinstance(msg, dict):
                speaker = msg.get("speaker", "Candidate")
                if speaker in ("AI", "Zara", "Interviewer"):
                    speaker = "Interviewer"
                elif speaker == "You":
                    speaker = "Candidate"
                lines.append(f"{speaker}: {msg.get('text', '')}")
            else:
                lines.append(str(msg))
    if not lines and answers:
        for item in answers:
            q = item.get("question", "")
            a = item.get("answer") or item.get("transcript") or ""
            lines.append(f"Interviewer: {q}")
            lines.append(f"Candidate: {a}")
            lines.append("")
    return "\n\n".join(lines)[:8000]


def _weighted_total(evaluation: dict) -> float:
    total = 0.0
    for key, weight in DIMENSION_WEIGHTS.items():
        block = evaluation.get(key) or {}
        score = block.get("score", 0) if isinstance(block, dict) else 0
        try:
            total += float(score) * weight
        except (TypeError, ValueError):
            pass
    return round(min(100, total), 1)


def _verdict_from_score(score: float) -> str:
    if score >= 85:
        return "Strong Hire"
    if score >= 70:
        return "Hire"
    if score >= 55:
        return "Lean Hire"
    if score >= 40:
        return "Lean No Hire"
    return "No Hire"


def evaluate_interview_transcript(
    candidate_name: str,
    role_title: str,
    transcript: list | str,
    answers: list | None = None,
    screening_score: float = 0,
    job_context: str = "",
) -> dict:
    """Holistic harness-style evaluation of full interview transcript."""
    transcript_text = _build_transcript_text(transcript, answers)
    if not transcript_text.strip():
        return {
            "candidate_name": candidate_name,
            "total_score": 0,
            "final_score": 0,
            "verdict": "No Hire",
            "recommendation": "Empty transcript — no answers to evaluate.",
            "evaluation_method": "harness_empty",
        }

    prompt = f"""You are evaluating a technical voice interview for a {role_title} position.

=== CANDIDATE ===
{candidate_name}
Resume screening score (context only, do NOT copy as interview score): {screening_score}/100

=== JOB DESCRIPTION / REQUIREMENTS (primary scoring reference) ===
{(job_context or "No JD provided — score strictly on demonstrated performance in transcript.")[:3000]}

=== INTERVIEW TRANSCRIPT (candidate performance) ===
{transcript_text}

=== EVALUATION ===
Score ONLY from what the candidate actually said in the transcript, measured against the job description above.
Penalize vague, off-topic, or missing answers. Do not invent skills not demonstrated.

Dimensions (each 0-100):

1. Technical Knowledge (weight: 0.35) — JD-relevant accuracy, depth, tools, concepts
2. Problem Solving (weight: 0.25) — approach to challenges, debugging, architecture per JD
3. Communication (weight: 0.20) — clarity, structure, explaining technical ideas
4. Culture Fit (weight: 0.10) — enthusiasm, collaboration, growth mindset
5. Experience Depth (weight: 0.10) — real examples tied to JD responsibilities

Return JSON only:
{{
    "candidate_name": "{candidate_name}",
    "technical_knowledge": {{"score": 75, "notes": "..."}},
    "problem_solving": {{"score": 70, "notes": "..."}},
    "communication": {{"score": 80, "notes": "..."}},
    "culture_fit": {{"score": 85, "notes": "..."}},
    "experience_depth": {{"score": 65, "notes": "..."}},
    "total_score": 74,
    "verdict": "Strong Hire | Hire | Lean Hire | Lean No Hire | No Hire",
    "top_strengths": ["strength 1", "strength 2"],
    "concerns": ["concern 1"],
    "recommendation": "One paragraph summary for the hiring manager"
}}

Score honestly. total_score above 70 = Hire, 55-70 = Lean Hire, below 55 = No Hire.
Short or empty answers should score low."""

    require_groq()
    evaluation = groq_json(
        "You evaluate technical interviews with rigorous, fair scoring.",
        prompt,
    )

    if not isinstance(evaluation, dict):
        raise GroqApiError(f"Groq interview evaluation failed for {candidate_name}")

    total = evaluation.get("total_score")
    if total is None:
        total = _weighted_total(evaluation)
    else:
        total = round(min(100, float(total)), 1)

    verdict = evaluation.get("verdict") or _verdict_from_score(total)
    interview_score = total
    manager_summary = evaluation.get("recommendation") or verdict

    # Reference: composite = 80% screening + 20% interview (interview_eval.py)
    composite = (
        round(0.8 * float(screening_score or 0) + 0.2 * interview_score)
        if screening_score
        else round(interview_score)
    )
    shortlisted = composite >= 50
    shortlist_verdict = (
        "Shortlisted for Final Round" if shortlisted else "Not Shortlisted"
    )

    tech = evaluation.get("technical_knowledge") or {}
    comm = evaluation.get("communication") or {}
    prob = evaluation.get("problem_solving") or {}
    culture = evaluation.get("culture_fit") or {}
    exp = evaluation.get("experience_depth") or {}

    strengths = evaluation.get("top_strengths") or []
    concerns = evaluation.get("concerns") or []

    ai_feedback = manager_summary
    if strengths:
        ai_feedback += "\n\nStrengths: " + ", ".join(strengths[:4])
    if concerns:
        ai_feedback += "\n\nConcerns: " + ", ".join(concerns[:4])

    return {
        "candidate_name": candidate_name,
        "technical_score": round(float(tech.get("score", total) if isinstance(tech, dict) else total), 1),
        "communication_score": round(float(comm.get("score", total) if isinstance(comm, dict) else total), 1),
        "confidence_score": round(float(comm.get("score", 70) if isinstance(comm, dict) else 70), 1),
        "jd_alignment_score": round(float(tech.get("score", total) if isinstance(tech, dict) else total), 1),
        "problem_solving_score": round(float(prob.get("score", total) if isinstance(prob, dict) else total), 1),
        "culture_fit_score": round(float(culture.get("score", total) if isinstance(culture, dict) else total), 1),
        "experience_depth_score": round(float(exp.get("score", total) if isinstance(exp, dict) else total), 1),
        "sentiment_score": round(float(culture.get("score", 70) if isinstance(culture, dict) else 70), 1),
        "fluency_score": round(float(comm.get("score", 70) if isinstance(comm, dict) else 70), 1),
        "voice_score": round(float(comm.get("score", 70) if isinstance(comm, dict) else 70), 1),
        "final_score": interview_score,
        "overall_score": interview_score,
        "total_score": interview_score,
        "interview_score": interview_score,
        "screening_score": screening_score,
        "composite_score": composite,
        "shortlist_verdict": shortlist_verdict,
        "shortlisted": shortlisted,
        "composite_formula": "80% screening + 20% interview",
        "verdict": verdict,
        "recommendation": manager_summary,
        "top_strengths": strengths,
        "concerns": concerns,
        "ai_feedback": ai_feedback,
        "harness_evaluation": evaluation,
        "evaluation_method": "harness_groq",
        "per_answer_feedback": [],
    }
