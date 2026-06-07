import os
import uuid
import aiofiles
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db, get_next_id, utcnow
from app.models.enums import UserRole, CandidateStatus
from app.schemas.candidate import CandidateResponse, ScreeningResult
from app.core.auth import require_roles, get_current_user
from app.services.ml_client import ml_client
from app.config import get_settings

router = APIRouter(prefix="/screening", tags=["Resume Screening"])
settings = get_settings()


async def save_upload(file: UploadFile) -> str:
    os.makedirs(settings.upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "resume.pdf")[1]
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(settings.upload_dir, filename)

    async with aiofiles.open(filepath, "wb") as f:
        content = await file.read()
        if len(content) > settings.max_upload_size_mb * 1024 * 1024:
            raise HTTPException(400, "File too large")
        await f.write(content)

    return filepath


def to_candidate_response(doc: dict) -> CandidateResponse:
    return CandidateResponse(
        id=doc["id"],
        name=doc["name"],
        email=doc["email"],
        phone=doc.get("phone"),
        skills=doc.get("skills", []),
        experience=doc.get("experience", []),
        education=doc.get("education", []),
        ai_score=doc.get("ai_score", 0),
        skill_match=doc.get("skill_match", {}),
        missing_skills=doc.get("missing_skills", []),
        feature_scores=doc.get("feature_scores", {}),
        status=CandidateStatus(doc.get("status", "applied")),
        job_id=doc.get("job_id"),
        created_at=doc["created_at"],
    )


async def build_candidate(database, job_id: int, parsed: dict, screening: dict, filepath: str) -> dict:
    return {
        "id": await get_next_id("candidates"),
        "name": parsed.get("name", "Unknown"),
        "email": parsed.get("email", f"unknown_{uuid.uuid4().hex[:8]}@temp.com"),
        "phone": parsed.get("phone"),
        "resume_path": filepath,
        "job_id": job_id,
        "skills": parsed.get("skills", []),
        "experience": parsed.get("experience", []),
        "education": parsed.get("education", []),
        "certifications": parsed.get("certifications", []),
        "projects": parsed.get("projects", []),
        "ai_score": screening.get("ai_score", 0),
        "skill_match": screening.get("skill_match", {}),
        "missing_skills": screening.get("missing_skills", []),
        "feature_scores": screening.get("feature_scores", {}),
        "parsed_data": parsed,
        "status": CandidateStatus.SCREENING.value,
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }


@router.post("/upload", response_model=CandidateResponse)
async def upload_single_resume(
    file: UploadFile = File(...),
    job_id: int = Form(...),
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    if file.content_type not in [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]:
        raise HTTPException(400, "Only PDF and DOCX files supported")

    job = await database.job_postings.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")

    filepath = await save_upload(file)
    parsed = await ml_client.parse_resume(filepath, file.filename or "resume.pdf")
    screening = await ml_client.screen_resume(parsed, job["description"])
    candidate = await build_candidate(database, job_id, parsed, screening, filepath)
    await database.candidates.insert_one(candidate)
    return to_candidate_response(candidate)


@router.post("/bulk-upload", response_model=ScreeningResult)
async def bulk_upload_resumes(
    files: list[UploadFile] = File(...),
    job_id: int = Form(...),
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    job = await database.job_postings.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")

    candidates = []
    for file in files:
        try:
            filepath = await save_upload(file)
            parsed = await ml_client.parse_resume(filepath, file.filename or "resume.pdf")
            screening = await ml_client.screen_resume(parsed, job["description"])
            candidate = await build_candidate(database, job_id, parsed, screening, filepath)
            await database.candidates.insert_one(candidate)
            candidates.append(candidate)
        except Exception:
            continue

    candidates.sort(key=lambda c: c["ai_score"], reverse=True)
    rankings = [
        {"rank": i + 1, "name": c["name"], "ai_score": c["ai_score"], "id": c["id"]}
        for i, c in enumerate(candidates)
    ]

    return ScreeningResult(
        total_processed=len(candidates),
        candidates=[to_candidate_response(c) for c in candidates],
        rankings=rankings,
    )


@router.get("/candidates", response_model=list[CandidateResponse])
async def list_candidates(
    job_id: int | None = None,
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    query = {"job_id": job_id} if job_id else {}
    cursor = database.candidates.find(query, {"_id": 0}).sort("ai_score", -1)
    candidates = await cursor.to_list(length=1000)
    return [to_candidate_response(c) for c in candidates]


@router.get("/candidates/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(
    candidate_id: int,
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    candidate = await database.candidates.find_one({"id": candidate_id}, {"_id": 0})
    if not candidate:
        raise HTTPException(404, "Candidate not found")
    return to_candidate_response(candidate)
