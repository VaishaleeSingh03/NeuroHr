"""Experience level helpers — reference repo uses free-text years (e.g. '2 years')."""

import re

_LEGACY_MAP = {
    "entry": "0-2 years",
    "junior": "0-2 years",
    "fresher": "0-2 years",
    "mid": "2-4 years",
    "middle": "2-4 years",
    "senior": "5+ years",
    "lead": "5+ years",
    "principal": "8+ years",
}

_LEGACY_YEARS = {
    "entry": 1.0,
    "junior": 1.0,
    "fresher": 0.0,
    "mid": 3.0,
    "middle": 3.0,
    "senior": 5.0,
    "lead": 6.0,
    "principal": 8.0,
}


def normalize_experience_level(value: str | None) -> str:
    """Normalize to a human-readable years string like the reference repo."""
    if not value or not str(value).strip():
        return "2 years"
    v = str(value).strip()
    lower = v.lower()
    if lower in _LEGACY_MAP:
        return _LEGACY_MAP[lower]
    if re.search(r"\d", v) and "year" in lower:
        return v
    if re.fullmatch(r"\d+(?:\.\d+)?", v):
        n = float(v)
        suffix = "year" if n == 1 else "years"
        return f"{int(n) if n == int(n) else n} {suffix}"
    return v


def parse_experience_years(value: str | None) -> float:
    """Extract a representative year count from strings like '2 years', '3+ years', '2-4 years'."""
    if not value:
        return 2.0
    v = str(value).strip().lower()
    if v in _LEGACY_YEARS:
        return _LEGACY_YEARS[v]

    plus = re.search(r"(\d+(?:\.\d+)?)\s*\+", v)
    if plus:
        return float(plus.group(1))

    range_match = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)", v)
    if range_match:
        return float(range_match.group(1))

    single = re.search(r"(\d+(?:\.\d+)?)", v)
    if single:
        return float(single.group(1))

    return 2.0


def difficulty_from_experience(value: str | None) -> str:
    years = parse_experience_years(value)
    if years >= 5:
        return "hard"
    if years >= 2:
        return "medium"
    return "easy"


def salary_bucket(value: str | None) -> str:
    years = parse_experience_years(value)
    if years >= 5:
        return "senior"
    if years >= 2:
        return "mid"
    return "entry"
