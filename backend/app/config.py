from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
_BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    app_name: str = "TalentAI Nexus API"
    app_version: str = "1.0.0"
    mongodb_url: str = (
        "mongodb+srv://vaishalisinghsln5_db_user:<db_password>"
        "@cluster0.hxsd3kk.mongodb.net/talentai_nexus"
        "?retryWrites=true&w=majority&appName=Cluster0"
    )
    mongodb_db: str = "talentai_nexus"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "123456789XYZ"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    ml_service_url: str = "http://localhost:8001"
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 50
    openai_api_key: str = ""

    class Config:
        env_file = (str(_BACKEND_ENV), str(_ROOT_ENV), ".env")
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
