"""Unified LLM routing — Groq (fast → strong) with optional Gemini Flash fallback."""

import logging

from config import get_settings
from pipelines.gemini_service import gemini_json, is_gemini_available
from pipelines.groq_service import (
    GroqApiError,
    GroqNotConfiguredError,
    groq_json,
    is_groq_available,
)

logger = logging.getLogger(__name__)
settings = get_settings()


def is_llm_available() -> bool:
    return is_groq_available() or is_gemini_available()


def require_llm() -> None:
    if not is_llm_available():
        raise GroqNotConfiguredError(
            "An LLM API key is required. Set GROQ_API_KEY and/or GEMINI_API_KEY "
            "in the project root .env and restart ml-service."
        )


def llm_json(
    system: str,
    user: str,
    *,
    model: str | None = None,
    prefer_fast: bool = True,
    max_tokens: int = 1536,
    strict: bool = False,
) -> dict | list | None:
    """
    Try providers in order (auto mode):
      1. Groq fast (llama-3.1-8b-instant) — free, ~1–3s
      2. Groq strong (llama-3.3-70b) — free, higher quality
      3. Gemini Flash — free Google AI Studio tier, fast fallback
    """
    provider = (settings.llm_provider or "auto").lower()
    errors: list[str] = []

    def try_groq(use_fast: bool) -> dict | list | None:
        if not is_groq_available():
            return None
        fast = settings.groq_model_fast
        strong = settings.groq_model_strong or settings.groq_model
        chosen = model or (fast if use_fast else strong)
        result = groq_json(system, user, model=chosen, strict=False, max_tokens=max_tokens)
        if result is not None:
            logger.info("llm_json succeeded via groq model=%s", chosen)
            return result
        errors.append(f"groq:{chosen}")
        if use_fast and chosen == fast and strong != fast:
            result = groq_json(system, user, model=strong, strict=False, max_tokens=max_tokens)
            if result is not None:
                logger.info("llm_json succeeded via groq strong fallback model=%s", strong)
                return result
            errors.append(f"groq:{strong}")
        return None

    def try_gemini() -> dict | list | None:
        if not is_gemini_available():
            return None
        result = gemini_json(system, user, strict=False, max_tokens=max_tokens)
        if result is not None:
            logger.info("llm_json succeeded via gemini model=%s", settings.gemini_model)
            return result
        errors.append(f"gemini:{settings.gemini_model}")
        return None

    if provider == "gemini":
        result = try_gemini() or try_groq(prefer_fast)
    elif provider == "groq":
        result = try_groq(prefer_fast)
    else:
        result = try_groq(prefer_fast) or try_gemini()

    if result is not None:
        return result

    msg = f"All LLM providers failed: {' | '.join(errors) or 'none configured'}"
    if strict:
        raise GroqApiError(msg)
    return None
