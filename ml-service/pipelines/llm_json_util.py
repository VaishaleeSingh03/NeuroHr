"""Shared LLM JSON calls — Groq only (no OpenAI fallback for screening)."""

from pipelines.groq_service import require_groq, groq_json, GroqApiError


def call_llm_json(system: str, user: str, *, strict: bool = True) -> dict:
    require_groq()
    result = groq_json(system, user, strict=strict)
    if not isinstance(result, dict):
        raise GroqApiError("Groq returned invalid JSON for screening.")
    return result
