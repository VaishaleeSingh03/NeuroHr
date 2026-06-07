from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.core.auth import get_current_user
from app.models.enums import CandidateStatus
from app.schemas.candidate import CandidateResponse

router = APIRouter(prefix="/portal", tags=["Candidate Portal"])


@router.get("/me")
async def get_my_portal(
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    candidate = await database.candidates.find_one({"email": user["email"]}, {"_id": 0})
    interviews = []
    documents = []
    onboarding = None

    if candidate:
        interviews = await database.interviews.find(
            {"candidate_id": candidate["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(10)

        documents = await database.document_analyses.find(
            {"candidate_id": candidate["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(10)

        onboarding = await database.onboarding_plans.find_one(
            {"candidate_id": candidate["id"]}, {"_id": 0},
            sort=[("created_at", -1)],
        )

    job = None
    if candidate and candidate.get("job_id"):
        job = await database.job_postings.find_one(
            {"id": candidate["job_id"]}, {"_id": 0, "title": 1, "description": 1}
        )

    return {
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
        },
        "candidate": candidate,
        "job": job,
        "application_status": candidate.get("status", "not_applied") if candidate else "not_applied",
        "ai_score": candidate.get("ai_score", 0) if candidate else 0,
        "interviews": interviews,
        "documents": documents,
        "onboarding": onboarding,
        "stats": {
            "total_interviews": len(interviews),
            "completed_interviews": sum(1 for i in interviews if i.get("status") == "completed"),
            "total_documents": len(documents),
            "has_onboarding": onboarding is not None,
        },
    }


@router.get("/my-candidate", response_model=CandidateResponse | None)
async def get_my_candidate_record(
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    candidate = await database.candidates.find_one({"email": user["email"]}, {"_id": 0})
    if not candidate:
        return None
    return CandidateResponse(
        id=candidate["id"],
        name=candidate["name"],
        email=candidate["email"],
        phone=candidate.get("phone"),
        skills=candidate.get("skills", []),
        experience=candidate.get("experience", []),
        education=candidate.get("education", []),
        ai_score=candidate.get("ai_score", 0),
        skill_match=candidate.get("skill_match", {}),
        missing_skills=candidate.get("missing_skills", []),
        feature_scores=candidate.get("feature_scores", {}),
        status=CandidateStatus(candidate.get("status", "applied")),
        job_id=candidate.get("job_id"),
        created_at=candidate["created_at"],
    )
