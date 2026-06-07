from datetime import datetime
from pydantic import BaseModel


class OnboardingCreate(BaseModel):
    candidate_id: int
    position: str
    department: str
    start_date: str


class OnboardingResponse(BaseModel):
    id: int
    candidate_id: int
    offer_letter: str | None
    joining_checklist: list
    training_plan: dict
    day_30_plan: dict
    day_60_plan: dict
    day_90_plan: dict
    documentation: list
    status: str
    created_at: datetime
