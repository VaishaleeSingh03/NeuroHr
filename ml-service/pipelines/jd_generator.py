"""KB-aware JD generation — Agent 1 pipeline using Groq only.

Pipeline:
  1. analyze_tech_stack  — read KB catalog → Groq extracts tech profile
  2. map_skills           — Groq classifies must-have vs nice-to-have
  3. draft_jd             — Groq writes 7-section Markdown JD
  4. serialize_jd         — Groq structures metadata + skills

Interview questions are generated later when AI interview is scheduled
(resume + JD via Groq in interview_question_generator.py).
"""

import json
import logging
import re
from datetime import datetime, timezone

from pipelines.knowledgebase import build_kb_context, ORG_NAME, ORG_MISSION
from pipelines.repo_analyzer import analyze_tech_stack
from pipelines.groq_service import (
    GroqApiError,
    GroqNotConfiguredError,
    groq_json,
    groq_strong,
    require_groq,
)
from pipelines.experience_utils import normalize_experience_level, difficulty_from_experience

logger = logging.getLogger(__name__)

__all__ = ["draft_jd_from_kb", "GroqNotConfiguredError", "GroqApiError"]

_JSON_COMPACT = {"separators": (",", ":")}


def _require_groq_text(text: str | None, step: str) -> str:
    if not text or not str(text).strip():
        raise GroqApiError(
            f"Groq returned no content during {step}. "
            "Check GROQ_API_KEY, model settings, and Groq service status, then try again."
        )
    return str(text).strip()


def _require_groq_dict(result: object, step: str) -> dict:
    if not isinstance(result, dict):
        raise GroqApiError(
            f"Groq returned invalid JSON during {step}. "
            "Please retry — do not use fallback JD content."
        )
    return result


def _compact_tech_stack(profile: dict) -> dict:
    return {
        "summary": profile.get("summary", ""),
        "primary_language": profile.get("primary_language", ""),
        "frameworks": (profile.get("frameworks") or [])[:10],
        "libraries": (profile.get("libraries") or [])[:8],
        "databases": (profile.get("databases") or [])[:6],
        "ai_ml": (profile.get("ai_ml") or [])[:6],
        "repos_analyzed": profile.get("repos_analyzed") or [],
    }


def _compact_skills_matrix(matrix: dict) -> dict:
    def skill_names(key: str, limit: int = 8) -> list[str]:
        items = matrix.get(key) or []
        names = []
        for item in items[:limit]:
            if isinstance(item, dict):
                names.append(item.get("skill", ""))
            else:
                names.append(str(item))
        return [n for n in names if n]

    return {
        "must_have": skill_names("must_have"),
        "nice_to_have": skill_names("nice_to_have"),
        "must_have_count": matrix.get("must_have_count", 0),
        "nice_to_have_count": matrix.get("nice_to_have_count", 0),
    }


def _compact_kb_excerpt(kb_context: dict, limit: int = 1400) -> str:
    index = (kb_context.get("index_excerpt") or "")[:500]
    combined = (kb_context.get("combined_context") or "")[:limit - len(index)]
    parts = [p.strip() for p in (index, combined) if p and p.strip()]
    return "\n".join(parts)[:limit]


def _normalize_skill_items(items: list) -> list[dict]:
    out = []
    for item in items or []:
        if isinstance(item, dict):
            skill = item.get("skill") or item.get("name") or ""
            if skill:
                out.append({
                    "skill": skill,
                    "category": item.get("category", "technical"),
                    "reason": item.get("reason", "From knowledge base"),
                })
        elif isinstance(item, str) and item.strip():
            out.append({
                "skill": item.strip(),
                "category": "technical",
                "reason": "From knowledge base",
            })
    return out


def map_skills(tech_stack_profile: dict, role_title: str, experience_level: str, kb_excerpt: str = "") -> dict:
    """Sub-Agent 2 — classify tech stack into must-have vs nice-to-have (Groq)."""
    prompt = (
        f'Classify skills for "{role_title}" ({experience_level}) at {ORG_NAME}.\n'
        f"Tech: {json.dumps(_compact_tech_stack(tech_stack_profile), **_JSON_COMPACT)}\n"
        f"KB: {kb_excerpt[:800]}\n"
        'Return JSON object with keys: role_title, experience_level, must_have (string[]), '
        "nice_to_have (string[]), must_have_count, nice_to_have_count. "
        "6-10 must-have skills, 4-8 nice-to-have. KB-grounded only."
    )

    result = groq_json(
        "Expert technical recruiter. Output JSON object only.",
        prompt,
        strict=True,
    )
    parsed = _require_groq_dict(result, "skills mapping")
    must_have = _normalize_skill_items(parsed.get("must_have", []))
    nice_to_have = _normalize_skill_items(parsed.get("nice_to_have", []))
    parsed["must_have"] = must_have
    parsed["nice_to_have"] = nice_to_have
    parsed["role_title"] = parsed.get("role_title") or role_title
    parsed["experience_level"] = parsed.get("experience_level") or experience_level
    parsed["must_have_count"] = len(must_have)
    parsed["nice_to_have_count"] = len(nice_to_have)
    return parsed


def draft_jd_markdown(
    skills_matrix: dict,
    tech_stack_profile: dict,
    role_title: str,
    experience_level: str,
    department: str,
    kb_excerpt: str = "",
    feedback: str | None = None,
) -> str:
    """Sub-Agent 3 — Groq drafts 7-section Markdown JD."""
    feedback_section = ""
    if feedback:
        feedback_section = f"\n\nHR feedback to apply:\n{feedback[:600]}\n"

    prompt = (
        f"Write a {role_title} JD ({experience_level}, {department}) for {ORG_NAME}.\n"
        f"Mission: {ORG_MISSION}\n\n"
        f"Tech: {json.dumps(_compact_tech_stack(tech_stack_profile), **_JSON_COMPACT)}\n"
        f"Skills: {json.dumps(_compact_skills_matrix(skills_matrix), **_JSON_COMPACT)}\n"
        f"KB: {kb_excerpt[:900]}"
        f"{feedback_section}\n\n"
        "Output Markdown with exactly these ## headings in order:\n"
        "About the Role | What You'll Do | Qualifications | Nice to Have | "
        "Benefits | Location & Experience | "
        f"About {ORG_NAME}\n"
        "Use real KB technologies. Modern tone. Bullets for lists."
    )

    jd = groq_strong(
        f"You write compelling JDs for {ORG_NAME} from their real repos.",
        prompt,
        strict=True,
    )
    text = _require_groq_text(jd, "JD drafting")
    logger.info("JD drafted via Groq: %s chars", len(text))
    return text


def _section_bullets(block: str) -> list[str]:
    items = []
    for line in block.splitlines():
        stripped = line.strip()
        if stripped.startswith(("-", "*", "•")):
            items.append(re.sub(r"^[-*•]\s*", "", stripped).strip())
        elif re.match(r"^\d+\.", stripped):
            items.append(re.sub(r"^\d+\.\s*", "", stripped).strip())
    return [i for i in items if i]


def _parse_jd_sections(jd_markdown: str) -> dict:
    """Parse ## headings from Groq-drafted markdown into structured sections."""
    aliases = {
        "about the role": "about_role",
        "what you'll do": "responsibilities",
        "what youll do": "responsibilities",
        "qualifications": "qualifications",
        "nice to have": "nice_to_have",
        "benefits": "benefits",
        "location & experience": "location_experience",
        "location and experience": "location_experience",
        f"about {ORG_NAME.lower()}": "about_company",
        "about company": "about_company",
    }
    sections = {
        "about_role": "",
        "responsibilities": [],
        "qualifications": [],
        "nice_to_have": [],
        "benefits": [],
        "location_experience": "",
        "about_company": "",
    }
    parts = re.split(r"(?m)^##\s+", jd_markdown.strip())
    for part in parts:
        if not part.strip():
            continue
        lines = part.strip().splitlines()
        heading = lines[0].strip().lower().rstrip(":")
        body = "\n".join(lines[1:]).strip()
        key = aliases.get(heading)
        if not key:
            continue
        if key in ("responsibilities", "qualifications", "nice_to_have", "benefits"):
            bullets = _section_bullets(body)
            sections[key] = bullets if bullets else [body] if body else []
        else:
            sections[key] = body
    return sections


def serialize_jd(jd_markdown: str, skills_matrix: dict, role_title: str, department: str) -> dict:
    """Sub-Agent 4 — structure JD markdown + skills matrix (no extra Groq call)."""
    compact = _compact_skills_matrix(skills_matrix)
    return {
        "title": role_title,
        "sections": _parse_jd_sections(jd_markdown),
        "metadata": {
            "role_title": role_title,
            "department": department,
            "skills_must_have": compact.get("must_have", []),
            "skills_nice_to_have": compact.get("nice_to_have", []),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def draft_jd_from_kb(
    role_title: str,
    experience_level: str = "2 years",
    department: str = "Engineering",
    feedback: str | None = None,
) -> dict:
    """Full Agent 1 pipeline — KB insights → Groq JD (no interview questions at this stage)."""
    require_groq()
    experience_level = normalize_experience_level(experience_level)

    audit_log = []
    kb_context = build_kb_context(role_title, experience_level)
    kb_excerpt = _compact_kb_excerpt(kb_context)

    tech_stack = analyze_tech_stack(role_title, experience_level)
    audit_log.append({
        "step": "analyze_repos",
        "repos": tech_stack.get("repos_analyzed", kb_context.get("repos", [])),
        "summary": tech_stack.get("summary", ""),
    })

    skills_matrix = map_skills(tech_stack, role_title, experience_level, kb_excerpt)
    audit_log.append({
        "step": "map_skills",
        "must_have_count": skills_matrix.get("must_have_count", 0),
        "nice_to_have_count": skills_matrix.get("nice_to_have_count", 0),
    })

    description = draft_jd_markdown(
        skills_matrix,
        tech_stack,
        role_title,
        experience_level,
        department,
        kb_excerpt,
        feedback,
    )
    audit_log.append({
        "step": "draft_jd",
        "word_count": len(description.split()),
    })

    jd_json = serialize_jd(description, skills_matrix, role_title, department)
    audit_log.append({"step": "serialize_jd", "title": jd_json.get("title", role_title)})

    must_have = [
        s.get("skill") for s in skills_matrix.get("must_have", []) if isinstance(s, dict)
    ]
    nice_to_have = [
        s.get("skill") for s in skills_matrix.get("nice_to_have", []) if isinstance(s, dict)
    ]
    if not must_have and jd_json.get("metadata", {}).get("skills_must_have"):
        must_have = jd_json["metadata"]["skills_must_have"]

    return {
        "title": role_title,
        "description": description,
        "required_skills": must_have,
        "nice_to_have_skills": nice_to_have,
        "experience_level": experience_level,
        "difficulty_level": difficulty_from_experience(experience_level),
        "interview_questions": [],
        "skills_matrix": skills_matrix,
        "tech_stack_profile": tech_stack,
        "jd_json": jd_json,
        "kb_repos": tech_stack.get("repos_analyzed", kb_context.get("repos", [])),
        "generated_by": "groq",
        "org_name": ORG_NAME,
        "pipeline": audit_log,
    }
