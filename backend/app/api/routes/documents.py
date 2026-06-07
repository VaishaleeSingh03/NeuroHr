import os
import uuid
import aiofiles
from fastapi import APIRouter, Depends, UploadFile, File, Form
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db, get_next_id, utcnow
from app.models.enums import UserRole
from app.schemas.document import DocumentAnalysisResponse
from app.core.auth import require_roles
from app.services.ml_client import ml_client
from app.config import get_settings

router = APIRouter(prefix="/documents", tags=["Document Intelligence"])
settings = get_settings()


@router.post("/analyze", response_model=DocumentAnalysisResponse)
async def analyze_document(
    file: UploadFile = File(...),
    document_type: str = Form("resume"),
    candidate_id: int | None = Form(None),
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.CANDIDATE)),
):
    os.makedirs(settings.upload_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}_{file.filename}"
    filepath = os.path.join(settings.upload_dir, filename)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(await file.read())

    result = await ml_client.analyze_document(filepath, document_type)

    doc = {
        "id": await get_next_id("document_analyses"),
        "candidate_id": candidate_id,
        "document_type": document_type,
        "file_path": filepath,
        "extracted_text": result.get("extracted_text", ""),
        "extracted_fields": result.get("extracted_fields", {}),
        "verification_score": result.get("verification_score", 0),
        "ocr_confidence": result.get("ocr_confidence", 0),
        "analysis": result.get("analysis", {}),
        "created_at": utcnow(),
    }
    await database.document_analyses.insert_one(doc)
    return DocumentAnalysisResponse(**doc)


@router.get("/", response_model=list[DocumentAnalysisResponse])
async def list_documents(
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    cursor = database.document_analyses.find({}, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(length=100)
    return [DocumentAnalysisResponse(**d) for d in docs]
