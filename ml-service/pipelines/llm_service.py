import json
from config import get_settings

settings = get_settings()
_client = None


def _get_client():
    global _client
    if _client is None and settings.openai_api_key:
        try:
            from openai import OpenAI
            _client = OpenAI(api_key=settings.openai_api_key)
        except Exception:
            pass
    return _client


def is_available() -> bool:
    return bool(settings.openai_api_key) and _get_client() is not None


def chat_completion(system: str, user: str, temperature: float = 0.7) -> str | None:
    client = _get_client()
    if not client:
        return None
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
        )
        return response.choices[0].message.content
    except Exception:
        return None


def chat_json(system: str, user: str) -> dict | None:
    text = chat_completion(system, user + "\n\nRespond with valid JSON only.", 0.3)
    if not text:
        return None
    try:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        return json.loads(cleaned.strip())
    except Exception:
        return None
