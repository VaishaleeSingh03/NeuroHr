from fastapi import APIRouter
from app.api.routes import (
    auth, jobs, screening, interviews, ml_training,
    chat, analytics, onboarding, documents, admin, candidate_portal,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(jobs.router)
api_router.include_router(screening.router)
api_router.include_router(interviews.router)
api_router.include_router(ml_training.router)
api_router.include_router(chat.router)
api_router.include_router(analytics.router)
api_router.include_router(onboarding.router)
api_router.include_router(documents.router)
api_router.include_router(admin.router)
api_router.include_router(candidate_portal.router)
