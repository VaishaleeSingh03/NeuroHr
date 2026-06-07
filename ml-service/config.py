from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

_ROOT_ENV = Path(__file__).resolve().parents[1] / ".env"
_SERVICE_ENV = Path(__file__).resolve().parent / ".env"
_PROJECT_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_dir: str = "./models"
    data_dir: str = "./data"
    openai_api_key: str = ""
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_model_strong: str = "llama-3.3-70b-versatile"
    groq_model_fast: str = "llama-3.1-8b-instant"
    groq_request_token_budget: int = 5500
    knowledgebase_path: str = str(_PROJECT_ROOT / "knowledgebase")
    org_name: str = "XYZ"

    class Config:
        env_file = (str(_SERVICE_ENV), str(_ROOT_ENV), ".env")
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def resolved_knowledgebase_path() -> str:
    """Resolve KB path relative to project root when .env uses ./knowledgebase."""
    settings = get_settings()
    p = Path(settings.knowledgebase_path or "knowledgebase")
    if not p.is_absolute():
        p = _PROJECT_ROOT / p
    return str(p.resolve())
