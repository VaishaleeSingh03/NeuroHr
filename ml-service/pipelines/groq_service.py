"""Groq API client for JD generation and strong LLM tasks (replaces Codex in reference repo)."""

import json
import logging
import re

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
_client = None
_last_groq_error: str | None = None


class GroqNotConfiguredError(RuntimeError):
    """Raised when GROQ_API_KEY is missing or the Groq client cannot be initialized."""


class GroqApiError(RuntimeError):
    """Raised when a Groq API call fails or returns empty/invalid output."""


def _get_client():
    global _client
    if _client is None and settings.groq_api_key:
        try:
            from groq import Groq
            _client = Groq(api_key=settings.groq_api_key)
        except Exception as exc:
            logger.error("Groq client init failed: %s", exc)
    return _client


def is_groq_available() -> bool:
    return bool(settings.groq_api_key) and _get_client() is not None


def require_groq() -> None:
    if not settings.groq_api_key:
        raise GroqNotConfiguredError(
            "GROQ_API_KEY is required for JD generation. "
            "Set GROQ_API_KEY in the project root .env and restart ml-service."
        )
    if _get_client() is None:
        raise GroqNotConfiguredError(
            "Groq client failed to initialize. Check GROQ_API_KEY and restart ml-service."
        )


def last_groq_error() -> str | None:
    return _last_groq_error


def _estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def _cap_max_tokens(system: str, user: str, max_tokens: int) -> int:
    """Keep input + max_tokens under Groq on-demand TPM/request limits (~6000)."""
    budget = getattr(settings, "groq_request_token_budget", None) or 5500
    input_est = _estimate_tokens(system) + _estimate_tokens(user) + 80
    available = budget - input_est
    capped = min(max_tokens, max(256, available))
    if capped < max_tokens:
        logger.info(
            "Capped Groq max_tokens %s -> %s (est. input %s, budget %s)",
            max_tokens, capped, input_est, budget,
        )
    return capped


def _extract_json_text(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return ""
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        for part in parts[1:]:
            chunk = part.strip()
            if chunk.startswith("json"):
                chunk = chunk[4:].strip()
            if chunk.startswith("{") or chunk.startswith("["):
                return chunk
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        return match.group(0)
    match = re.search(r"\[[\s\S]*\]", cleaned)
    if match:
        return match.group(0)
    return cleaned


def groq_chat(
    system: str,
    user: str,
    temperature: float = 0.5,
    model: str | None = None,
    max_tokens: int = 4096,
    *,
    strict: bool = False,
    json_mode: bool = False,
) -> str | None:
    global _last_groq_error
    client = _get_client()
    if not client:
        msg = "Groq client is not configured."
        _last_groq_error = msg
        if strict:
            raise GroqApiError(msg)
        return None
    safe_max = _cap_max_tokens(system, user, max_tokens)
    kwargs = {
        "model": model or settings.groq_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": safe_max,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    try:
        response = client.chat.completions.create(**kwargs)
        _last_groq_error = None
        return response.choices[0].message.content
    except Exception as exc:
        _last_groq_error = str(exc)
        logger.error("Groq chat failed (%s): %s", model or settings.groq_model, exc)
        if strict:
            raise GroqApiError(f"Groq API error: {exc}") from exc
        return None


def groq_strong(system: str, user: str, temperature: float = 0.4, *, strict: bool = False) -> str | None:
    """Long-form generation (JD drafting) — mirrors call_llm_strong in reference repo."""
    model = getattr(settings, "groq_model_strong", None) or settings.groq_model
    return groq_chat(system, user, temperature=temperature, model=model, max_tokens=2048, strict=strict)


def groq_json(
    system: str,
    user: str,
    *,
    model: str | None = None,
    strict: bool = False,
    max_tokens: int = 1536,
) -> dict | list | None:
    fast_model = getattr(settings, "groq_model_fast", None) or settings.groq_model
    json_system = f"{system} You must reply with a single valid JSON object only — no markdown, no prose."
    text = groq_chat(
        json_system,
        user,
        0.1,
        model=model or fast_model,
        max_tokens=max_tokens,
        strict=strict,
        json_mode=True,
    )
    if not text or not str(text).strip():
        if strict:
            raise GroqApiError(last_groq_error() or "Groq returned empty response for JSON request.")
        return None
    try:
        return json.loads(_extract_json_text(text))
    except Exception as exc:
        snippet = str(text).strip()[:240].replace("\n", " ")
        msg = f"Groq returned invalid JSON: {exc}. Response preview: {snippet!r}"
        logger.error(msg)
        if strict:
            raise GroqApiError(msg) from exc
        return None
