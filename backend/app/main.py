import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.database import connect_db, close_db, get_db, get_next_id, utcnow
from app.api.router import api_router
from app.models.enums import UserRole
from app.core.security import get_password_hash

settings = get_settings()


async def seed_admin():
    database = await get_db()
    existing = await database.users.find_one({"email": "admin@talentai.com"})
    if not existing:
        users = [
            {
                "id": await get_next_id("users"),
                "name": "System Admin",
                "email": "admin@talentai.com",
                "password_hash": get_password_hash("admin123"),
                "role": UserRole.ADMIN.value,
                "is_active": True,
                "created_at": utcnow(),
                "updated_at": utcnow(),
            },
            {
                "id": await get_next_id("users"),
                "name": "HR Recruiter",
                "email": "recruiter@talentai.com",
                "password_hash": get_password_hash("recruiter123"),
                "role": UserRole.RECRUITER.value,
                "is_active": True,
                "created_at": utcnow(),
                "updated_at": utcnow(),
            },
            {
                "id": await get_next_id("users"),
                "name": "Demo Candidate",
                "email": "candidate@talentai.com",
                "password_hash": get_password_hash("candidate123"),
                "role": UserRole.CANDIDATE.value,
                "is_active": True,
                "created_at": utcnow(),
                "updated_at": utcnow(),
            },
        ]
        await database.users.insert_many(users)


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.upload_dir, exist_ok=True)
    await connect_db()
    await seed_admin()
    yield
    await close_db()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="TalentAI Nexus – Generative AI Recruitment & Workforce Automation System",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "talentai-nexus-backend", "database": "mongodb"}
