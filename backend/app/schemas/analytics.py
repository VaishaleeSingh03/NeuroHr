from pydantic import BaseModel


class AnalyticsResponse(BaseModel):
    hiring_funnel: dict
    total_applications: int
    selected_candidates: int
    rejected_candidates: int
    average_ai_score: float
    skill_trends: list
    interview_performance: dict
    predictions: dict
    charts: dict
