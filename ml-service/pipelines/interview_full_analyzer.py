from pipelines.groq_service import GroqApiError
from pipelines.interview_analyzer import analyze_answer, analyze_video_frame
from pipelines.interview_evaluator import evaluate_interview_transcript


def analyze_full_interview(
    questions: list,
    answers: list,
    job_context: str = "",
    video_analysis: dict = None,
    transcript: str = "",
    candidate_name: str = "Candidate",
    role_title: str = "",
    screening_score: float = 0,
    harness_transcript: list | None = None,
) -> dict:
    """Analyze complete voice interview — Groq harness eval only (JD + candidate performance)."""
    video = video_analysis or {}

    harness_result = evaluate_interview_transcript(
        candidate_name=candidate_name,
        role_title=role_title or "Position",
        transcript=harness_transcript or transcript,
        answers=answers,
        screening_score=screening_score,
        job_context=job_context,
    )

    method = harness_result.get("evaluation_method", "")
    if method == "harness_empty":
        return harness_result
    if method != "harness_groq":
        raise GroqApiError(
            f"Interview analysis requires Groq harness (got {method or 'none'}). "
            "Set GROQ_API_KEY and restart ml-service."
        )

    result = {**harness_result}
    # Interview score is purely from Groq (transcript + JD). Video stored for reference only.
    result["video_analysis"] = video
    # Skip N extra Groq per-answer calls — harness eval already scores the full transcript (faster).
    result["per_answer_feedback"] = []
    return result


def _per_answer_from_qa(questions: list, answers: list, job_context: str) -> list:
    per_answer = []
    for i, ans in enumerate(answers or []):
        q_text = ans.get("question") or (questions[i].get("question") if i < len(questions) else "")
        a_text = ans.get("answer") or ans.get("transcript") or ""
        if len(a_text.strip()) < 5:
            continue
        result = analyze_answer(q_text, a_text, job_context)
        per_answer.append({
            "question": q_text,
            "answer": a_text,
            "technical_score": result["technical_score"],
            "communication_score": result["communication_score"],
            "jd_alignment_score": result.get("jd_alignment_score", result["technical_score"]),
            "feedback": result.get("feedback", ""),
        })
    return per_answer
