from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.models.enums import UserRole, CandidateStatus
from app.schemas.analytics import AnalyticsResponse
from app.core.auth import require_roles

router = APIRouter(prefix="/analytics", tags=["Analytics"])

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


async def _monthly_applications(database) -> list[dict]:
    six_months_ago = datetime.now(timezone.utc) - timedelta(days=180)
    pipeline = [
        {"$match": {"created_at": {"$gte": six_months_ago}}},
        {"$group": {
            "_id": {"$month": "$created_at"},
            "count": {"$sum": 1},
            "year": {"$first": {"$year": "$created_at"}},
        }},
        {"$sort": {"_id": 1}},
    ]
    results = await database.candidates.aggregate(pipeline).to_list(12)
    month_map = {r["_id"]: r["count"] for r in results}

    now = datetime.now(timezone.utc)
    monthly = []
    for i in range(5, -1, -1):
        d = now - timedelta(days=30 * i)
        month_num = d.month
        monthly.append({
            "month": MONTH_NAMES[month_num - 1],
            "year": d.year,
            "count": month_map.get(month_num, 0),
        })
    return monthly


async def _time_to_hire_days(database) -> float:
    selected = await database.candidates.find(
        {"status": {"$in": [CandidateStatus.SELECTED.value, CandidateStatus.ONBOARDING.value]}},
        {"_id": 0, "created_at": 1, "updated_at": 1},
    ).to_list(500)

    if not selected:
        return 0.0

    total_days = 0
    for c in selected:
        created = c.get("created_at")
        updated = c.get("updated_at", created)
        if created and updated:
            delta = updated - created if isinstance(updated, datetime) else timedelta(days=14)
            total_days += delta.days if hasattr(delta, "days") else 14

    return round(total_days / len(selected), 1)


@router.get("/dashboard", response_model=AnalyticsResponse)
async def get_dashboard(
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    total = await database.candidates.count_documents({})
    selected = await database.candidates.count_documents({
        "status": {"$in": [CandidateStatus.SELECTED.value, CandidateStatus.ONBOARDING.value]}
    })
    rejected = await database.candidates.count_documents({"status": CandidateStatus.REJECTED.value})

    agg = await database.candidates.aggregate([
        {"$group": {"_id": None, "avg": {"$avg": "$ai_score"}}}
    ]).to_list(1)
    avg_score = agg[0]["avg"] if agg else 0

    cursor = database.candidates.find({}, {"_id": 0, "skills": 1, "ai_score": 1})
    candidates = await cursor.to_list(length=10000)

    skill_counts: dict[str, int] = {}
    for c in candidates:
        for skill in c.get("skills") or []:
            skill_counts[skill] = skill_counts.get(skill, 0) + 1
    skill_trends = sorted(
        [{"skill": k, "count": v} for k, v in skill_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:15]

    interviews = await database.interviews.find(
        {"status": "completed"}, {"_id": 0}
    ).to_list(1000)

    interview_perf = {
        "avg_technical": sum(i.get("technical_score", 0) for i in interviews) / max(len(interviews), 1),
        "avg_communication": sum(i.get("communication_score", 0) for i in interviews) / max(len(interviews), 1),
        "avg_confidence": sum(i.get("confidence_score", 0) for i in interviews) / max(len(interviews), 1),
        "total_interviews": len(interviews),
    }

    status_counts = {}
    for status in CandidateStatus:
        status_counts[status.value] = await database.candidates.count_documents({"status": status.value})

    time_to_hire = await _time_to_hire_days(database)
    monthly_apps = await _monthly_applications(database)

    hire_rate = (selected / max(total, 1)) * 100
    interview_rate = len(interviews) / max(total, 1) * 100

    return AnalyticsResponse(
        hiring_funnel=status_counts,
        total_applications=total,
        selected_candidates=selected,
        rejected_candidates=rejected,
        average_ai_score=round(float(avg_score or 0), 2),
        skill_trends=skill_trends,
        interview_performance=interview_perf,
        predictions={
            "hiring_success_probability": round(min(95, hire_rate * 0.6 + interview_rate * 0.4 + 10), 1),
            "time_to_hire_days": time_to_hire or 28,
            "quality_of_hire_score": round(float(avg_score or 0) * 0.85 + hire_rate * 0.15, 1),
        },
        charts={
            "funnel_bar": list(status_counts.items()),
            "score_distribution": [
                {"range": "90-100", "count": sum(1 for c in candidates if c.get("ai_score", 0) >= 90)},
                {"range": "70-89", "count": sum(1 for c in candidates if 70 <= c.get("ai_score", 0) < 90)},
                {"range": "50-69", "count": sum(1 for c in candidates if 50 <= c.get("ai_score", 0) < 70)},
                {"range": "0-49", "count": sum(1 for c in candidates if c.get("ai_score", 0) < 50)},
            ],
            "monthly_applications": monthly_apps,
            "skill_heatmap": skill_trends[:10],
        },
    )
