from datetime import datetime
from pydantic import BaseModel


class DocumentAnalysisResponse(BaseModel):
    id: int
    document_type: str
    extracted_text: str | None
    extracted_fields: dict
    verification_score: float
    ocr_confidence: float
    analysis: dict
    created_at: datetime
