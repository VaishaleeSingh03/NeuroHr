from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db, utcnow
from app.models.enums import UserRole
from app.schemas.user import UserResponse
from app.core.auth import require_roles

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN)),
):
    cursor = database.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1)
    users = await cursor.to_list(length=500)
    return [
        UserResponse(
            id=u["id"],
            name=u["name"],
            email=u["email"],
            role=UserRole(u["role"]),
            is_active=u.get("is_active", True),
        )
        for u in users
    ]


@router.patch("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: int,
    database: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles(UserRole.ADMIN)),
):
    target = await database.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")

    new_status = not target.get("is_active", True)
    await database.users.update_one(
        {"id": user_id},
        {"$set": {"is_active": new_status, "updated_at": utcnow()}},
    )
    return {"id": user_id, "is_active": new_status}


@router.get("/stats")
async def admin_stats(
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN)),
):
    return {
        "total_users": await database.users.count_documents({}),
        "total_recruiters": await database.users.count_documents({"role": UserRole.RECRUITER.value}),
        "total_candidates": await database.candidates.count_documents({}),
        "total_interviews": await database.interviews.count_documents({}),
        "total_models": await database.ml_models.count_documents({}),
    }
