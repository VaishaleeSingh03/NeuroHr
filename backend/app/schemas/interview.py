from datetime import datetime
from pydantic import BaseModel


class InterviewCreate(BaseModel):
    candidate_id: int
    job_id: int | None = None


class InterviewSubmit(BaseModel):
    answers: list[dict]
    transcript: str | None = None
    video_analysis: dict | None = None


class InterviewResponse(BaseModel):
    id: int
    candidate_id: int
    questions: list
    answers: list
    video_analysis: dict
    technical_score: float
    communication_score: float
    confidence_score: float
    fluency_score: float
    sentiment_score: float
    overall_score: float
    status: str
    created_at: datetime
