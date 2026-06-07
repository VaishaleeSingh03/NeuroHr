"""Google Gemini Flash — free tier fallback when Groq fails."""

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


def _gemini_url(model_name: str) -> str:
    return (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model_name}:generateContent"
    )


def _gemini_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    key = settings.gemini_api_key or ""
    if key.startswith("AQ.") or key.startswith("ya29."):
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _gemini_request_url(model_name: str) -> str:
    key = settings.gemini_api_key or ""
    url = _gemini_url(model_name)
    if not key.startswith("AQ.") and not key.startswith("ya29."):
        return f"{url}?key={key}"
    return url


def _gemini_generate(
    system: str,
    user: str,
    *,
    model: str | None = None,
    max_tokens: int = 1536,
    temperature: float = 0.05,
    json_mode: bool = False,
    strict: bool = False,
) -> str | None:
    if not settings.gemini_api_key:
        if strict:
            raise GroqApiError("GEMINI_API_KEY is not configured.")
        return None

    model_name = model or settings.gemini_model
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
            _gemini_request_url(model_name),
            data=json.dumps(body).encode("utf-8"),
            headers=_gemini_headers(),
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        msg = f"Gemini API error ({exc.code}): {detail}"
        logger.warning(msg)
        if strict:
            raise GroqApiError(msg) from exc
        return None
    except Exception as exc:
        msg = f"Gemini API error: {exc}"
        logger.warning(msg)
        if strict:
            raise GroqApiError(msg) from exc
        return None

    try:
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        msg = f"Gemini returned unexpected response: {str(payload)[:400]}"
        if strict:
            raise GroqApiError(msg) from exc
        return None

    if not text or not str(text).strip():
        if strict:
            raise GroqApiError("Gemini returned empty response.")
        return None
    return str(text).strip()


def gemini_chat(
    system: str,
    user: str,
    *,
    model: str | None = None,
    max_tokens: int = 2048,
    temperature: float = 0.4,
    json_mode: bool = False,
    strict: bool = False,
) -> str | None:
    return _gemini_generate(
        system,
        user,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        json_mode=json_mode,
        strict=strict,
    )


def gemini_json(
    system: str,
    user: str,
    *,
    model: str | None = None,
    max_tokens: int = 1536,
    strict: bool = False,
) -> dict | list | None:
    json_system = (
        f"{system} "
        "Reply with ONE valid JSON object only. "
        "Every key must be double-quoted. No markdown fences."
    )
    text = _gemini_generate(
        json_system,
        user,
        model=model,
        max_tokens=max_tokens,
        temperature=0.05,
        json_mode=True,
        strict=strict,
    )
    if not text:
        return None
    try:
        return _parse_json_response(text)
    except Exception as exc:
        snippet = _extract_json_text(text)[:120]
        msg = f"Gemini JSON parse failed: {exc}: {snippet!r}"
        if strict:
            raise GroqApiError(msg) from exc
        return None
