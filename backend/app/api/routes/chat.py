from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.models.enums import UserRole
from app.schemas.chat import ChatRequest, ChatResponse
from app.core.auth import require_roles
from app.services.ml_client import ml_client

router = APIRouter(prefix="/chat", tags=["HR AI Assistant"])


@router.post("/", response_model=ChatResponse)
async def chat(
    data: ChatRequest,
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    cursor = database.candidates.find({}, {"_id": 0, "name": 1, "skills": 1, "ai_score": 1, "status": 1}).sort("ai_score", -1).limit(20)
    docs = await cursor.to_list(length=20)
    candidates = [
        {"name": c["name"], "skills": c.get("skills", []), "ai_score": c.get("ai_score", 0), "status": c.get("status", "applied")}
        for c in docs
    ]

    context = {**(data.context or {}), "candidates": candidates, "user_role": user["role"]}
    response = await ml_client.chat(data.message, context)
    return ChatResponse(**response)
