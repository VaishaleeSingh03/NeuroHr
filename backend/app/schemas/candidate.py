from datetime import datetime
from pydantic import BaseModel, EmailStr
from app.models.enums import CandidateStatus


class JobPostingCreate(BaseModel):
    title: str
    description: str


class JobPostingResponse(BaseModel):
    id: int
    title: str
    description: str
    required_skills: list
    experience_level: str
    interview_questions: list
    difficulty_level: str
    salary_insights: dict
    created_at: datetime


class CandidateCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    job_id: int | None = None


class CandidateResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: str | None = None
    skills: list = []
    experience: list = []
    education: list = []
    ai_score: float = 0.0
    skill_match: dict = {}
    missing_skills: list = []
    feature_scores: dict = {}
    status: CandidateStatus
    job_id: int | None = None
    created_at: datetime


class ScreeningResult(BaseModel):
    total_processed: int
    candidates: list[CandidateResponse]
    rankings: list[dict]
