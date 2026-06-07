from pipelines.preprocessing import extract_skills_from_text
from pipelines.llm_service import is_available, chat_json, chat_completion
from pipelines.jd_analyzer import generate_interview_questions_from_jd, is_software_role


def _format_jd_questions(items: list, count: int, job_title: str) -> dict:
    questions = []
    for i, item in enumerate(items[:count]):
        questions.append({
            "id": i + 1,
            "question": item["question"],
            "skill": item.get("skill", ""),
            "type": item.get("type", "technical"),
            "time_limit_seconds": 120,
        })
    return {"questions": questions, "job_title": job_title}


def generate_questions(
    job_title: str,
    skills: list,
    count: int = 5,
    job_description: str = "",
) -> dict:
    merged_skills = list(skills or [])
    if job_description:
        jd_skills = extract_skills_from_text(job_description)
        for skill in jd_skills:
            if skill not in merged_skills:
                merged_skills.append(skill)

    software = is_software_role(job_title, job_description, merged_skills)
    tech_ratio = "at least 85% technical" if software else "mostly JD-aligned competency checks"
    forbidden = (
        "Do NOT ask generic questions like 'Why are you interested in this role?', "
        "'Where do you see yourself in 3 years?', or 'Tell me about yourself'."
    )

    if is_available() and job_description:
        jd_block = f"\n\nFull Job Description:\n{job_description[:3000]}"
        result = chat_json(
            "You are a senior technical interviewer. Every question MUST come directly from the job description.",
            f"""Job Title: {job_title}
Required Skills: {', '.join(merged_skills[:20])}{jd_block}

Generate exactly {count} interview questions for this role.

Rules:
1. {forbidden}
2. Each question must reference a specific JD skill, tool, responsibility, or requirement.
3. For software/developer/engineering roles: {tech_ratio} — cover architecture, implementation, debugging, APIs, databases, deployment as listed in the JD.
4. Include deep technical questions (system design, trade-offs, production scenarios) when the JD mentions engineering work.
5. Types allowed: technical, jd_alignment, system_design — no generic behavioral.

Return JSON with key "questions" — array of objects: id (number), question (string), skill (string, optional), type (string), time_limit_seconds (number, use 120)""",
        )
        if result and isinstance(result, list):
            return _format_jd_questions(result, count, job_title)
        if result and isinstance(result, dict) and "questions" in result:
            return _format_jd_questions(result["questions"], count, job_title)

    if job_description:
        jd_questions = generate_interview_questions_from_jd(
            job_description, merged_skills, job_title=job_title, count=count,
        )
        if jd_questions:
            return _format_jd_questions(jd_questions, count, job_title)

    # Minimal fallback — still skill/JD tied
    questions = []
    for i, skill in enumerate(merged_skills[:count]):
        if software:
            text = (
                f"For this {job_title} role, the JD requires {skill}. "
                f"Explain how you would design and implement a production feature using {skill}, "
                "including testing and deployment considerations."
            )
        else:
            text = (
                f"How does your experience with {skill} map to a specific requirement "
                f"in the {job_title} job description?"
            )
        questions.append({
            "id": i + 1,
            "question": text,
            "skill": skill,
            "type": "technical" if software else "jd_alignment",
            "time_limit_seconds": 120,
        })

    while len(questions) < count:
        questions.append({
            "id": len(questions) + 1,
            "question": (
                f"Select one core responsibility from the {job_title} job description and walk through "
                "your technical approach to delivering it end-to-end."
            ),
            "type": "technical" if software else "jd_alignment",
            "time_limit_seconds": 120,
        })

    return {"questions": questions[:count], "job_title": job_title}


def analyze_answer(question: str, answer: str, job_context: str) -> dict:
    """Per-answer scoring — Groq only, JD-aligned. No heuristic fallback."""
    from pipelines.groq_service import GroqApiError, groq_interview_json, require_groq

    if not answer or len(answer.strip()) < 5:
        return {
            "technical_score": 0,
            "communication_score": 0,
            "confidence_score": 0,
            "jd_alignment_score": 0,
            "sentiment_score": 0,
            "fluency_score": 0,
            "feedback": "No substantive answer provided.",
            "evaluation_method": "empty_answer",
        }

    require_groq()
    result = groq_interview_json(
        "You score interview answers 0-100 strictly against the job description and question. Be honest; weak answers score low.",
        f"""JOB DESCRIPTION / CONTEXT:
{job_context[:1500]}

QUESTION: {question}

CANDIDATE ANSWER: {answer}

Score based on JD relevance, technical depth demonstrated in the answer, and communication.
Return JSON only with: technical_score, communication_score, confidence_score, jd_alignment_score, sentiment_score, fluency_score, feedback (2-3 sentences referencing JD fit)""",
        max_tokens=768,
    )
    if not isinstance(result, dict):
        raise GroqApiError("Groq per-answer interview evaluation returned invalid JSON")

    return {
        "technical_score": float(result.get("technical_score", 0)),
        "communication_score": float(result.get("communication_score", 0)),
        "confidence_score": float(result.get("confidence_score", 0)),
        "jd_alignment_score": float(result.get("jd_alignment_score", result.get("technical_score", 0))),
        "sentiment_score": float(result.get("sentiment_score", 0)),
        "fluency_score": float(result.get("fluency_score", 0)),
        "feedback": result.get("feedback", ""),
        "evaluation_method": "groq_per_answer",
    }


def analyze_video_frame(image_base64: str) -> dict:
    """Computer vision analysis using OpenCV."""
    try:
        import base64
        import numpy as np
        import cv2

        img_data = base64.b64decode(image_base64.split(",")[-1] if "," in image_base64 else image_base64)
        nparr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return _default_video_analysis()

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)

        face_present = len(faces) > 0
        attention_score = 85 if face_present else 30

        if face_present:
            x, y, w, h = faces[0]
            face_center_x = x + w / 2
            frame_center_x = frame.shape[1] / 2
            offset = abs(face_center_x - frame_center_x) / frame.shape[1]
            eye_contact = max(40, 100 - offset * 200)
        else:
            eye_contact = 20

        fluency = min(95, 60 + attention_score * 0.35)
        sentiment = min(90, 55 + eye_contact * 0.35)
        return {
            "face_present": face_present,
            "face_count": len(faces),
            "eye_contact_score": round(eye_contact, 1),
            "attention_score": round(attention_score, 1),
            "fluency_score": round(fluency, 1),
            "sentiment_score": round(sentiment, 1),
            "expression": "neutral_positive" if face_present else "no_face_detected",
        }
    except Exception:
        return _default_video_analysis()


def _default_video_analysis() -> dict:
    """No fabricated scores — mark video analysis unavailable."""
    return {
        "face_present": False,
        "eye_contact_score": 0.0,
        "attention_score": 0.0,
        "fluency_score": 0.0,
        "sentiment_score": 0.0,
        "expression": "unavailable",
        "analysis_unavailable": True,
    }
