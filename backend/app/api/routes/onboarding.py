from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db, get_next_id, utcnow
from app.models.enums import UserRole, CandidateStatus
from app.schemas.onboarding import OnboardingCreate, OnboardingResponse
from app.core.auth import require_roles
from app.services.ml_client import ml_client

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])


@router.post("/generate", response_model=OnboardingResponse)
async def generate_onboarding(
    data: OnboardingCreate,
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    candidate = await database.candidates.find_one({"id": data.candidate_id}, {"_id": 0})
    if not candidate:
        raise HTTPException(404, "Candidate not found")

    result = await ml_client.generate_onboarding(
        {
            "name": candidate["name"],
            "skills": candidate.get("skills", []),
            "experience": candidate.get("experience", []),
            "position": data.position,
            "department": data.department,
            "start_date": data.start_date,
        },
        data.position,
    )

    plan = {
        "id": await get_next_id("onboarding_plans"),
        "candidate_id": data.candidate_id,
        "offer_letter": result.get("offer_letter", ""),
        "joining_checklist": result.get("joining_checklist", []),
        "training_plan": result.get("training_plan", {}),
        "day_30_plan": result.get("day_30_plan", {}),
        "day_60_plan": result.get("day_60_plan", {}),
        "day_90_plan": result.get("day_90_plan", {}),
        "documentation": result.get("documentation", []),
        "status": "generated",
        "created_at": utcnow(),
    }
    await database.onboarding_plans.insert_one(plan)
    await database.candidates.update_one(
        {"id": data.candidate_id},
        {"$set": {"status": CandidateStatus.ONBOARDING.value, "updated_at": utcnow()}},
    )
    return OnboardingResponse(**plan)


@router.get("/", response_model=list[OnboardingResponse])
async def list_onboarding(
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    cursor = database.onboarding_plans.find({}, {"_id": 0}).sort("created_at", -1)
    plans = await cursor.to_list(length=100)
    return [OnboardingResponse(**p) for p in plans]


@router.get("/{plan_id}", response_model=OnboardingResponse)
async def get_onboarding(plan_id: int, database: AsyncIOMotorDatabase = Depends(get_db)):
    plan = await database.onboarding_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Onboarding plan not found")
    return OnboardingResponse(**plan)
