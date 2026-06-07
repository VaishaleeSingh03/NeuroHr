from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db, get_next_id, utcnow
from app.models.enums import UserRole
from app.schemas.interview import InterviewCreate, InterviewSubmit, InterviewResponse
from app.core.auth import require_roles, get_current_user
from app.services.ml_client import ml_client

router = APIRouter(prefix="/interviews", tags=["AI Interviews"])


class VideoFrameRequest(BaseModel):
    image: str


@router.post("/start", response_model=InterviewResponse)
async def start_interview(
    data: InterviewCreate,
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    candidate = await database.candidates.find_one({"id": data.candidate_id}, {"_id": 0})
    if not candidate:
        raise HTTPException(404, "Candidate not found")

    job_id = data.job_id or candidate.get("job_id")
    job = await database.job_postings.find_one({"id": job_id}, {"_id": 0}) if job_id else None
    job_title = job["title"] if job else "General Position"
    skills = candidate.get("skills") or (job.get("required_skills") if job else [])

    questions_data = await ml_client.generate_interview_questions(job_title, skills, 5)

    interview = {
        "id": await get_next_id("interviews"),
        "candidate_id": data.candidate_id,
        "job_id": job_id,
        "questions": questions_data.get("questions", []),
        "answers": [],
        "video_analysis": {},
        "technical_score": 0.0,
        "communication_score": 0.0,
        "confidence_score": 0.0,
        "fluency_score": 0.0,
        "sentiment_score": 0.0,
        "overall_score": 0.0,
        "transcript": None,
        "status": "in_progress",
        "created_at": utcnow(),
        "completed_at": None,
    }
    await database.interviews.insert_one(interview)
    return InterviewResponse(**interview)


@router.post("/{interview_id}/submit", response_model=InterviewResponse)
async def submit_interview(
    interview_id: int,
    data: InterviewSubmit,
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    interview = await database.interviews.find_one({"id": interview_id}, {"_id": 0})
    if not interview:
        raise HTTPException(404, "Interview not found")

    job = None
    if interview.get("job_id"):
        job = await database.job_postings.find_one({"id": interview["job_id"]}, {"_id": 0})
    job_context = job["description"] if job else ""

    technical_scores = []
    communication_scores = []
    confidence_scores = []

    for i, answer in enumerate(data.answers):
        question = interview["questions"][i] if i < len(interview["questions"]) else {}
        q_text = question.get("question", "") if isinstance(question, dict) else str(question)
        a_text = answer.get("answer", "") if isinstance(answer, dict) else str(answer)

        analysis = await ml_client.analyze_interview_answer(q_text, a_text, job_context)
        technical_scores.append(analysis.get("technical_score", 70))
        communication_scores.append(analysis.get("communication_score", 70))
        confidence_scores.append(analysis.get("confidence_score", 70))

    stored_video = interview.get("video_analysis") or {}
    video = {**stored_video, **(data.video_analysis or {})}
    technical_score = sum(technical_scores) / max(len(technical_scores), 1)
    communication_score = sum(communication_scores) / max(len(communication_scores), 1)
    confidence_score = sum(confidence_scores) / max(len(confidence_scores), 1)
    fluency_score = video.get("fluency_score", 75)
    sentiment_score = video.get("sentiment_score", 70)
    overall_score = (
        technical_score * 0.35
        + communication_score * 0.25
        + confidence_score * 0.2
        + fluency_score * 0.1
        + sentiment_score * 0.1
    )

    updates = {
        "answers": data.answers,
        "transcript": data.transcript,
        "video_analysis": video,
        "technical_score": technical_score,
        "communication_score": communication_score,
        "confidence_score": confidence_score,
        "fluency_score": fluency_score,
        "sentiment_score": sentiment_score,
        "overall_score": overall_score,
        "status": "completed",
        "completed_at": utcnow(),
    }
    await database.interviews.update_one({"id": interview_id}, {"$set": updates})
    interview.update(updates)
    return InterviewResponse(**interview)


@router.get("/", response_model=list[InterviewResponse])
async def list_interviews(
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    cursor = database.interviews.find({}, {"_id": 0}).sort("created_at", -1)
    interviews = await cursor.to_list(length=500)
    return [InterviewResponse(**i) for i in interviews]


@router.post("/{interview_id}/analyze-frame")
async def analyze_interview_frame(
    interview_id: int,
    data: VideoFrameRequest,
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    interview = await database.interviews.find_one({"id": interview_id}, {"_id": 0})
    if not interview:
        raise HTTPException(404, "Interview not found")

    analysis = await ml_client.analyze_video_frame(data.image)

    existing = interview.get("video_analysis", {})
    frame_count = existing.get("frame_count", 0) + 1
    for key in ("eye_contact_score", "attention_score", "fluency_score", "sentiment_score"):
        prev = existing.get(key, analysis.get(key, 0))
        existing[key] = round((prev * (frame_count - 1) + analysis.get(key, 0)) / frame_count, 1)

    existing.update({
        "face_present": analysis.get("face_present", False),
        "expression": analysis.get("expression", "neutral"),
        "frame_count": frame_count,
        "last_frame": analysis,
    })

    await database.interviews.update_one(
        {"id": interview_id},
        {"$set": {"video_analysis": existing}},
    )
    return existing


@router.get("/my", response_model=list[InterviewResponse])
async def my_interviews(
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    candidate = await database.candidates.find_one({"email": user["email"]}, {"_id": 0, "id": 1})
    if not candidate:
        return []
    cursor = database.interviews.find(
        {"candidate_id": candidate["id"]}, {"_id": 0}
    ).sort("created_at", -1)
    interviews = await cursor.to_list(20)
    return [InterviewResponse(**i) for i in interviews]


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: int,
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    interview = await database.interviews.find_one({"id": interview_id}, {"_id": 0})
    if not interview:
        raise HTTPException(404, "Interview not found")
    return InterviewResponse(**interview)
