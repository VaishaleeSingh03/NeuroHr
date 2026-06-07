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


def _parse_json_response(text: str) -> dict | list:
    return json.loads(_extract_json_text(text))


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
        logger.warning("Groq chat failed (%s, json_mode=%s): %s", model or settings.groq_model, json_mode, exc)
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
    """
    Groq-only JSON helper with retries.
    llama-3.1-8b-instant often fails json_validate_failed on long inputs — retry without
    response_format and/or with the strong model before giving up.
    """
    fast_model = getattr(settings, "groq_model_fast", None) or settings.groq_model
    strong_model = getattr(settings, "groq_model_strong", None) or fast_model
    primary = model or fast_model

    json_system = (
        f"{system} "
        "Reply with ONE valid JSON object only. "
        "Every key must be double-quoted. "
        "Do not paste raw resume or JD text outside JSON string values. "
        "No markdown fences."
    )

    attempts: list[tuple[str, bool]] = [
        (primary, True),
        (primary, False),
    ]
    if strong_model != primary:
        attempts.extend([(strong_model, True), (strong_model, False)])

    errors: list[str] = []
    for attempt_model, use_json_mode in attempts:
        text = groq_chat(
            json_system,
            user,
            0.05,
            model=attempt_model,
            max_tokens=max_tokens,
            strict=False,
            json_mode=use_json_mode,
        )
        if not text or not str(text).strip():
            errors.append(f"{attempt_model}(json={use_json_mode}):empty")
            continue
        try:
            parsed = _parse_json_response(text)
            if attempt_model != primary or not use_json_mode:
                logger.info(
                    "Groq JSON succeeded on retry model=%s json_mode=%s",
                    attempt_model,
                    use_json_mode,
                )
            return parsed
        except Exception as exc:
            snippet = str(text).strip()[:120].replace("\n", " ")
            errors.append(f"{attempt_model}(json={use_json_mode}):{exc}: {snippet!r}")
            continue

    msg = f"Groq JSON failed after {len(attempts)} attempts: {' | '.join(errors)}"
    logger.error(msg)
    if strict:
        raise GroqApiError(msg)
    return None
