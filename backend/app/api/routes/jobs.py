from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db, get_next_id, utcnow
from app.models.enums import UserRole
from app.schemas.candidate import JobPostingCreate, JobPostingResponse
from app.core.auth import require_roles
from app.services.ml_client import ml_client

router = APIRouter(prefix="/jobs", tags=["Job Descriptions"])


@router.post("/", response_model=JobPostingResponse)
async def create_job(
    job_data: JobPostingCreate,
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    analysis = await ml_client.analyze_jd(job_data.description, job_data.title)

    job = {
        "id": await get_next_id("job_postings"),
        "title": job_data.title,
        "description": job_data.description,
        "required_skills": analysis.get("required_skills", []),
        "experience_level": analysis.get("experience_level", "mid"),
        "interview_questions": analysis.get("interview_questions", []),
        "difficulty_level": analysis.get("difficulty_level", "medium"),
        "salary_insights": analysis.get("salary_insights", {}),
        "created_by": user["id"],
        "created_at": utcnow(),
    }
    await database.job_postings.insert_one(job)
    return JobPostingResponse(**{k: v for k, v in job.items() if k != "_id"})


@router.get("/", response_model=list[JobPostingResponse])
async def list_jobs(database: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = database.job_postings.find({}, {"_id": 0}).sort("created_at", -1)
    jobs = await cursor.to_list(length=100)
    return [JobPostingResponse(**j) for j in jobs]


@router.get("/{job_id}", response_model=JobPostingResponse)
async def get_job(job_id: int, database: AsyncIOMotorDatabase = Depends(get_db)):
    job = await database.job_postings.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    return JobPostingResponse(**job)


@router.post("/{job_id}/analyze")
async def reanalyze_job(
    job_id: int,
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    job = await database.job_postings.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")

    analysis = await ml_client.analyze_jd(job["description"], job["title"])
    updates = {
        "required_skills": analysis.get("required_skills", []),
        "experience_level": analysis.get("experience_level", "mid"),
        "interview_questions": analysis.get("interview_questions", []),
        "difficulty_level": analysis.get("difficulty_level", "medium"),
        "salary_insights": analysis.get("salary_insights", {}),
    }
    await database.job_postings.update_one({"id": job_id}, {"$set": updates})
    job.update(updates)
    return JobPostingResponse(**job)
