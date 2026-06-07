from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.models.enums import UserRole
from app.core.security import decode_access_token

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    database: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = int(payload.get("sub", 0))
    user = await database.users.find_one({"id": user_id}, {"_id": 0})

    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def require_roles(*roles: UserRole):
    async def role_checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in [r.value for r in roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of: {[r.value for r in roles]}",
            )
        return user

    return role_checker
