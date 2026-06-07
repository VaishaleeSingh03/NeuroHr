"""Agent 1 / Sub-Agent 1 — Repo Analyzer (great-harness-agent style, Groq instead of Codex).

Reads org knowledge base catalog entries for the role and uses Groq to extract a tech stack profile.
"""

import json
import logging

from pipelines.knowledgebase import get_repos_by_role, read_index, ORG_NAME
from pipelines.groq_service import groq_json, require_groq, GroqApiError

logger = logging.getLogger(__name__)


def analyze_tech_stack(role_title: str, experience_level: str = "2 years") -> dict:
    """Read KB repos relevant to the role → Groq extracts tech stack profile."""
    require_groq()
    logger.info("Analyzing tech stack for %s (%s)", role_title, experience_level)

    repos = get_repos_by_role(role_title)
    if not repos:
        raise GroqApiError(
            f"No knowledge base repos found for role '{role_title}'. "
            "Add catalog entries under knowledgebase/catalog/ and retry."
        )

    index = read_index()
    catalog_summary = ""
    for name, content in repos.items():
        lines = content.split("\n")[:18]
        catalog_summary += f"\n--- {name} ---\n" + "\n".join(lines) + "\n"

    prompt = (
        f"Analyze {ORG_NAME} KB repos for hiring \"{role_title}\" ({experience_level}).\n\n"
        f"Index:\n{index[:700]}\n\n"
        f"Repos:\n{catalog_summary[:2200]}\n\n"
        f"Return JSON: role_title, primary_language, frameworks, libraries, databases, "
        f"infrastructure, testing, build_tools, communication, ai_ml (arrays), "
        f"repos_analyzed {json.dumps(list(repos.keys()))}, summary (2 sentences). "
        "Use only tech evidenced in the repos."
    )

    result = groq_json(
        "Expert engineering manager. Output JSON object only.",
        prompt,
        strict=True,
    )
    if not isinstance(result, dict):
        raise GroqApiError("Groq tech stack analysis returned invalid JSON.")

    result["repos_analyzed"] = list(repos.keys())
    summary = result.get("summary", "")
    if isinstance(summary, list):
        result["summary"] = " ".join(str(s).strip() for s in summary if s)
    elif not isinstance(summary, str):
        result["summary"] = str(summary or "")

    logger.info(
        "Tech stack extracted via Groq: %s frameworks, %s repos",
        len(result.get("frameworks", [])),
        len(repos),
    )
    return result
