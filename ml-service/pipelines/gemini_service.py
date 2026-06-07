"""Google Gemini Flash — fallback when Groq fails (AIza and AQ. keys via x-goog-api-key)."""

import json
import logging
import urllib.error
import urllib.request

from config import get_settings
from pipelines.groq_service import GroqApiError, _extract_json_text, _parse_json_response

logger = logging.getLogger(__name__)
settings = get_settings()


def is_gemini_available() -> bool:
    return bool(settings.gemini_api_key)


def _request_url(model_name: str) -> str:
    return (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model_name}:generateContent"
    )


def _headers() -> dict[str, str]:
    key = settings.gemini_api_key or ""
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if not key:
        return headers
    # AQ.* keys require x-goog-api-key; legacy AIza keys accept query param or this header.
    headers["x-goog-api-key"] = key
    return headers


def _generate(
    system: str,
    user: str,
    *,
    max_tokens: int = 1536,
    temperature: float = 0.05,
    json_mode: bool = False,
    strict: bool = False,
) -> str | None:
    if not settings.gemini_api_key:
        if strict:
            raise GroqApiError("GEMINI_API_KEY is not configured.")
        return None

    body: dict = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"

    try:
        req = urllib.request.Request(
            _request_url(settings.gemini_model),
            data=json.dumps(body).encode("utf-8"),
            headers=_headers(),
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
        return str(text).strip() if text else None
    except Exception as exc:
        msg = f"Gemini API error: {exc}"
        logger.warning(msg)
        if strict:
            raise GroqApiError(msg) from exc
        return None


def gemini_chat(
    system: str,
    user: str,
    *,
    max_tokens: int = 2048,
    temperature: float = 0.4,
    json_mode: bool = False,
    strict: bool = False,
) -> str | None:
    return _generate(
        system, user,
        max_tokens=max_tokens,
        temperature=temperature,
        json_mode=json_mode,
        strict=strict,
    )


def gemini_json(
    system: str,
    user: str,
    *,
    max_tokens: int = 1536,
    strict: bool = False,
) -> dict | list | None:
    json_system = (
        f"{system} Reply with ONE valid JSON object only. "
        "Every key must be double-quoted. No markdown fences."
    )
    text = _generate(
        json_system, user,
        max_tokens=max_tokens,
        json_mode=True,
        strict=strict,
    )
    if not text:
        return None
    try:
        return _parse_json_response(text)
    except Exception as exc:
        if strict:
            raise GroqApiError(f"Gemini JSON parse failed: {exc}") from exc
        return None
