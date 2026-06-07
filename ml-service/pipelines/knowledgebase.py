"""Organization knowledge base reader — XYZ org repos (like reference knowledgebase.py)."""

import glob
import os
import re

from config import get_settings, resolved_knowledgebase_path


def kb_root() -> str:
    path = resolved_knowledgebase_path()
    if os.path.isdir(path):
        return path
    default = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "knowledgebase"))
    return default if os.path.isdir(default) else path


KB_ROOT = kb_root()

_settings = get_settings()
ORG_NAME = (_settings.org_name or "XYZ").strip() or "XYZ"
ORG_MISSION = (
    f"{ORG_NAME} builds AI-powered HR platforms, agentic mentor systems, "
    "and full-stack SaaS products (NeuroHR AI, DigitalRecruiter, ModuMentor, BreatheESG)."
)

ROLE_REPO_MAP = {
    "full stack": ["AI-Based-HR-Module", "frontend_DR", "backend_DR", "tech_task_management_be", "tech_task_management_fe"],
    "fullstack": ["AI-Based-HR-Module", "frontend_DR", "backend_DR"],
    "backend": ["backend_DR", "ModuMentorServer", "tech_task_management_be", "AI-Based-HR-Module"],
    "frontend": ["frontend_DR", "BreatheESG", "tech_task_management_fe", "AI-Based-HR-Module"],
    "ml": ["ModumentorAgent-", "AI-Based-HR-Module"],
    "ai": ["ModumentorAgent-", "DigitalRecruiter", "AI-Based-HR-Module"],
    "python": ["ModumentorAgent-", "ModuMentorClient"],
    "recruit": ["DigitalRecruiter", "frontend_DR", "backend_DR", "AI-Based-HR-Module"],
    "software": ["AI-Based-HR-Module", "frontend_DR", "backend_DR"],
    "developer": ["AI-Based-HR-Module", "tech_task_management_be", "tech_task_management_fe"],
}


def read_index() -> str:
    path = os.path.join(KB_ROOT, "INDEX.md")
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            return f.read()
    return ""


def list_catalog_repos() -> list[str]:
    catalog_dir = os.path.join(KB_ROOT, "catalog")
    if not os.path.isdir(catalog_dir):
        return []
    return sorted(
        os.path.basename(f).replace(".md", "")
        for f in glob.glob(os.path.join(catalog_dir, "*.md"))
    )


def read_catalog_entry(repo_name: str) -> str:
    path = os.path.join(KB_ROOT, "catalog", f"{repo_name}.md")
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            return f.read()
    return ""


def get_repos_for_role(role_title: str) -> list[str]:
    lower = role_title.lower()
    matched = []
    for keyword, repos in ROLE_REPO_MAP.items():
        if keyword in lower:
            matched.extend(repos)
    if not matched:
        matched = ["AI-Based-HR-Module", "DigitalRecruiter", "frontend_DR", "backend_DR"]
    seen = set()
    out = []
    for r in matched:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


def read_catalog_entries(repo_names: list[str]) -> dict[str, str]:
    """Read multiple catalog entries — returns {repo_name: content}."""
    return {name: read_catalog_entry(name) for name in repo_names if read_catalog_entry(name)}


def get_repos_by_role(role_title: str) -> dict[str, str]:
    """Select KB repos relevant to role title (reference repo get_repos_by_role)."""
    lower = role_title.lower()

    if any(kw in lower for kw in ["frontend", "front-end", "ui", "react", "next"]):
        names = ROLE_REPO_MAP.get("frontend", [])
    elif any(kw in lower for kw in ["backend", "back-end", "api", "node", "express"]):
        names = ROLE_REPO_MAP.get("backend", [])
    elif any(kw in lower for kw in ["fullstack", "full-stack", "full stack"]):
        names = ROLE_REPO_MAP.get("full stack", [])
    elif any(kw in lower for kw in ["ml", "machine learning", "data scientist"]):
        names = ROLE_REPO_MAP.get("ml", [])
    elif any(kw in lower for kw in ["ai", "llm", "agent"]):
        names = ROLE_REPO_MAP.get("ai", [])
    elif any(kw in lower for kw in ["python", "fastapi"]):
        names = ROLE_REPO_MAP.get("python", [])
    elif any(kw in lower for kw in ["recruit", "hr", "talent"]):
        names = ROLE_REPO_MAP.get("recruit", [])
    elif any(kw in lower for kw in ["software", "developer", "engineer"]):
        names = ROLE_REPO_MAP.get("software", [])
    else:
        names = get_repos_for_role(role_title)

    entries = read_catalog_entries(names)
    if entries:
        return entries

    all_repos = list_catalog_repos()
    return read_catalog_entries(all_repos[:12])


def build_kb_context(role_title: str, experience_level: str = "2 years") -> dict:
    repos = get_repos_for_role(role_title)
    entries = {name: read_catalog_entry(name) for name in repos if read_catalog_entry(name)}
    index = read_index()
    combined = "\n\n".join(f"### {name}\n{content[:1000]}" for name, content in entries.items())
    return {
        "org_name": ORG_NAME,
        "org_mission": ORG_MISSION,
        "role_title": role_title,
        "experience_level": experience_level,
        "repos": repos,
        "catalog_entries": entries,
        "index_excerpt": index[:1200],
        "combined_context": combined[:5000],
    }


def extract_tech_stack_from_kb(kb_context: dict) -> dict:
    text = kb_context.get("combined_context", "")
    skills = set()
    patterns = [
        r"Next\.js", r"React", r"TypeScript", r"JavaScript", r"Python", r"FastAPI",
        r"Express\.js", r"Node\.js", r"MongoDB", r"Tailwind", r"scikit-learn",
        r"OpenAI", r"Groq", r"JWT", r"Docker", r"NLP", r"LLM",
    ]
    for p in patterns:
        if re.search(p, text, re.I):
            skills.add(re.search(p, text, re.I).group(0))
    return {
        "frameworks": [s for s in skills if s.lower() in ("next.js", "react", "express.js", "fastapi")],
        "languages": [s for s in skills if s.lower() in ("typescript", "javascript", "python")],
        "databases": [s for s in skills if "mongo" in s.lower()],
        "ai_ml": [s for s in skills if s.lower() in ("openai", "groq", "scikit-learn", "nlp", "llm")],
        "all_skills": sorted(skills),
        "repos_analyzed": kb_context.get("repos", []),
    }
