from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ReturnDocument
from app.config import get_settings

settings = get_settings()
client: AsyncIOMotorClient | None = None
db: AsyncIOMotorDatabase | None = None

COLLECTIONS = [
    "users",
    "candidates",
    "job_postings",
    "interviews",
    "ml_models",
    "analytics",
    "onboarding_plans",
    "document_analyses",
]


async def connect_db():
    global client, db
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.mongodb_db]
    for name in COLLECTIONS:
        await db[name].create_index("id", unique=True)
    await db.users.create_index("email", unique=True)


async def close_db():
    global client
    if client:
        client.close()


async def get_db() -> AsyncIOMotorDatabase:
    if db is None:
        raise RuntimeError("Database not initialized")
    return db


async def get_next_id(collection: str) -> int:
    result = await db.counters.find_one_and_update(
        {"_id": collection},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return result["seq"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
