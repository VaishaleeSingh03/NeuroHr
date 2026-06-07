"""Interviewer briefing — great-harness-agent offers.py Sub-Agent 2 style."""

from pipelines.groq_service import GroqApiError, groq_strong, require_groq


def _answers_from_transcript(transcript: list) -> str:
    answers = [
        m.get("text", "")
        for m in (transcript or [])
        if m.get("speaker") in ("You", "Candidate")
    ]
    return "\n".join(f"- {a}" for a in answers[:8] if str(a).strip())


def generate_interviewer_briefing(payload: dict) -> dict:
    """Generate detailed interviewer briefing with screening + AI interview insights."""
    candidate_name = payload.get("candidate_name") or "Candidate"
    job_title = payload.get("job_title") or "Role"
    interviewer_name = payload.get("interviewer_name") or "Interviewer"
    interviewer_role = payload.get("interviewer_role") or "Panel Member"

    screening = payload.get("screening") or {}
    interview = payload.get("interview") or {}
    app = payload.get("application") or {}

    interview_score = interview.get("interview_score") or interview.get("interviewScore") or "N/A"
    verdict = interview.get("verdict") or "N/A"
    composite = interview.get("composite_score") or interview.get("compositeScore")
    screening_score = (
        screening.get("total_score")
        or screening.get("ai_score")
        or app.get("jd_score")
        or app.get("jdScore")
        or "N/A"
    )

    strengths = (
        screening.get("top_strengths")
        or app.get("matched_skills")
        or app.get("matchedSkills")
        or interview.get("top_strengths")
        or interview.get("topStrengths")
        or []
    )
    concerns = (
        interview.get("concerns")
        or screening.get("key_gaps")
        or app.get("missing_skills")
        or app.get("missingSkills")
        or []
    )
    recommendation = interview.get("recommendation") or screening.get("verdict") or ""
    jd_summary = app.get("jd_fit_summary") or app.get("jdFitSummary") or screening.get("decision_note") or ""

    transcript = interview.get("harness_transcript") or interview.get("harnessTranscript") or []
    answers_summary = _answers_from_transcript(transcript)
    if not answers_summary:
        answers_summary = "\n".join(
            f"- {str(a.get('answer') or a.get('transcript') or '')[:200]}"
            for a in (interview.get("answers") or interview.get("qa_log") or [])[:8]
            if str(a.get("answer") or a.get("transcript") or "").strip()
        )

    dim_lines = []
    dim_map = [
        ("Technical", ("technical_score", "technicalScore")),
        ("Communication", ("communication_score", "communicationScore")),
        ("Problem solving", ("problem_solving_score", "problemSolvingScore")),
        ("Culture fit", ("culture_fit_score", "cultureFitScore")),
        ("Experience depth", ("experience_depth_score", "experienceDepthScore")),
        ("JD alignment", ("jd_alignment_score", "jdAlignmentScore")),
    ]
    for label, keys in dim_map:
        val = next((interview.get(k) for k in keys if interview.get(k) is not None), None)
        if val is not None:
            dim_lines.append(f"- {label}: {round(float(val))}/100")

    prompt = f"""You are preparing a briefing for {interviewer_name} ({interviewer_role}) who will conduct a final technical interview with {candidate_name} for a {job_title} role.

=== RESUME SCREENING RESULTS ===
Score: {screening_score}/100
Verdict: {screening.get('verdict') or app.get('recommendation') or 'Reviewed'}
Summary: {jd_summary}
Matched skills: {', '.join(strengths[:12]) if strengths else 'N/A'}
Gaps / missing: {', '.join(concerns[:12]) if concerns else 'N/A'}
Red flags: {', '.join(screening.get('red_flags') or []) or 'None noted'}

=== AI VOICE INTERVIEW RESULTS ===
Interview score: {interview_score}/100
Verdict: {verdict}
Composite (80% screening + 20% interview): {composite if composite is not None else 'N/A'}/100
Recommendation: {recommendation}
AI feedback: {interview.get('ai_feedback') or interview.get('aiFeedback') or 'N/A'}
Dimension scores:
{chr(10).join(dim_lines) if dim_lines else '- Not available'}

=== CANDIDATE'S KEY ANSWERS FROM AI INTERVIEW ===
{answers_summary or 'No transcript captured.'}

=== GENERATE BRIEFING ===

Write an HTML-friendly briefing (use <p>, <ul>, <ol>, <strong> — no outer <html> wrapper) with these sections:

1. CANDIDATE SNAPSHOT (3-4 sentences)
   Who they are, experience level, tech stack, standout signals.

2. RESUME SCREENING HIGHLIGHTS
   - Strong areas (3 bullets)
   - Areas needing verification (3 bullets)
   - Red flags if any (1-2 bullets)

3. AI INTERVIEW — HOW THEY PASSED
   Scores, verdict, strengths, concerns, manager summary.

4. SUGGESTED INTERVIEW QUESTIONS (8-10 questions)
   Deep-dive on projects, probe screening gaps, live coding, system design.
   Format: numbered list with brief "what to look for" under each.

5. EVALUATION CRITERIA
   Rate after session: Technical Depth, Problem Solving, Communication, Culture Fit (each 1-5).

Keep it concise, actionable, and specific to this candidate."""

    require_groq()
    text = groq_strong(
        "You are an expert technical hiring manager preparing interview briefings. "
        "Use ONLY the candidate data provided — no generic filler.",
        prompt,
    )
    if not text or not str(text).strip():
        raise GroqApiError("Groq did not return interviewer briefing content.")
    return {"briefing_html": str(text).strip(), "generated_by": "groq"}
