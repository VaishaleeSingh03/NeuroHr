from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db, get_next_id, utcnow
from app.models.enums import UserRole
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=Token)
async def register(user_data: UserCreate, database: AsyncIOMotorDatabase = Depends(get_db)):
    existing = await database.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = {
        "id": await get_next_id("users"),
        "name": user_data.name,
        "email": user_data.email,
        "password_hash": get_password_hash(user_data.password),
        "role": user_data.role.value,
        "is_active": True,
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }
    await database.users.insert_one(user)

    token = create_access_token({"sub": str(user["id"]), "role": user["role"]})
    return Token(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            name=user["name"],
            email=user["email"],
            role=UserRole(user["role"]),
            is_active=user["is_active"],
        ),
    )


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, database: AsyncIOMotorDatabase = Depends(get_db)):
    user = await database.users.find_one({"email": credentials.email})

    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(user["id"]), "role": user["role"]})
    return Token(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            name=user["name"],
            email=user["email"],
            role=UserRole(user["role"]),
            is_active=user.get("is_active", True),
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        name=user["name"],
        email=user["email"],
        role=UserRole(user["role"]),
        is_active=user.get("is_active", True),
    )
