"""Shared LLM JSON calls — Groq fast/strong + optional Gemini Flash fallback."""

from pipelines.groq_service import GroqApiError
from pipelines.llm_provider import llm_json, require_llm


def call_llm_json(
    system: str,
    user: str,
    *,
    strict: bool = True,
    prefer_fast: bool = True,
    max_tokens: int = 1536,
) -> dict:
    require_llm()
    result = llm_json(
        system,
        user,
        strict=strict,
        prefer_fast=prefer_fast,
        max_tokens=max_tokens,
    )
    if not isinstance(result, dict):
        raise GroqApiError("LLM returned invalid JSON for screening.")
    return result
