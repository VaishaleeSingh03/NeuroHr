"""Map NeuroHR parsed resume → great-harness-agent screening profile."""

import re


def _years_from_experience(experience: list) -> float:
    total = 0.0
    for exp in experience or []:
        if isinstance(exp, dict):
            y = exp.get("years")
            if y:
                try:
                    total = max(total, float(y))
                except (TypeError, ValueError):
                    pass
            duration = str(exp.get("duration") or exp.get("description") or "")
            m = re.search(r"(\d+)\+?\s*years?", duration, re.I)
            if m:
                total = max(total, float(m.group(1)))
    return round(total, 1)


def _extract_repo_urls(text: str, projects: list) -> list[str]:
    urls: list[str] = []
    for match in re.finditer(r"https?://(?:www\.)?github\.com/[\w.-]+(?:/[\w.-]+)?", text or "", re.I):
        urls.append(match.group(0).rstrip(").,;"))
    for proj in projects or []:
        if isinstance(proj, dict):
            url = proj.get("url") or proj.get("link")
            if url and "github" in str(url).lower():
                urls.append(str(url))
    return list(dict.fromkeys(urls))[:5]


def _split_skills(skills: list, experience: list, projects: list) -> dict:
    all_skills = [str(s).strip() for s in (skills or []) if s]
    evidenced: set[str] = set()
    text_blob = " ".join(
        str(x)
        for block in (experience or []) + (projects or [])
        for x in (
            [block.get("title"), block.get("company"), block.get("description"), block.get("name")]
            if isinstance(block, dict)
            else [block]
        )
        if x
    ).lower()

    for skill in all_skills:
        if skill.lower() in text_blob:
            evidenced.add(skill)

    claimed_only = [s for s in all_skills if s not in evidenced]
    return {
        "evidenced": list(evidenced)[:20],
        "claimed_only": claimed_only[:20],
        "all_listed": all_skills[:30],
    }


def normalize_to_harness_profile(parsed_resume: dict) -> dict:
    """Convert our resume parser output to harness-agent screener input."""
    experience = parsed_resume.get("experience") or []
    projects = parsed_resume.get("projects") or []
    raw_text = parsed_resume.get("raw_text") or parsed_resume.get("processed_text") or ""

    work_history = []
    internships = []
    for exp in experience:
        if not isinstance(exp, dict):
            continue
        title = str(exp.get("title") or exp.get("role") or "").strip()
        company = str(exp.get("company") or "").strip()
        entry = {
            "company": company or "Unknown",
            "role": title or "Role",
            "duration_months": 0,
            "description": str(exp.get("description") or exp.get("duration") or ""),
            "skills_used": [],
            "impact_statements": [],
            "ownership_signals": [],
        }
        if re.search(r"\bintern", title, re.I):
            internships.append({
                "company": entry["company"],
                "role": entry["role"],
                "duration_months": 0,
                "domain_relevant": True,
                "description": entry["description"],
            })
        else:
            work_history.append(entry)

    years = parsed_resume.get("total_experience_years")
    if years is None:
        years = _years_from_experience(experience)
    if not years and not work_history and internships:
        years = 0.0

    skills_block = parsed_resume.get("skills")
    if isinstance(skills_block, dict):
        skills_split = skills_block
    else:
        skills_split = _split_skills(
            skills_block if isinstance(skills_block, list) else [],
            experience,
            projects,
        )

    education = []
    for edu in parsed_resume.get("education") or []:
        if isinstance(edu, dict):
            education.append({
                "degree": edu.get("degree") or edu.get("institution") or "",
                "institution": edu.get("institution") or edu.get("details") or "",
                "year": edu.get("year"),
                "gpa": edu.get("gpa"),
            })
        elif isinstance(edu, str):
            education.append({"degree": edu, "institution": ""})

    certs = parsed_resume.get("certifications") or []
    certifications = []
    for c in certs:
        if isinstance(c, dict):
            certifications.append(c)
        else:
            certifications.append({"name": str(c), "relevant": True})

    proj_out = []
    for p in projects:
        if isinstance(p, dict):
            proj_out.append({
                "name": p.get("title") or p.get("name") or "Project",
                "description": p.get("description") or "",
                "tech": p.get("tech") or [],
                "url": p.get("url"),
                "is_self_initiated": True,
            })

    github_urls = _extract_repo_urls(raw_text, projects)
    online = {}
    for label, pattern in [
        ("linkedin", r"linkedin\.com/in/[\w%-]+"),
        ("github", r"github\.com/[\w.-]+"),
        ("portfolio", r"https?://[\w.-]+\.(?:dev|io|com)/[\w./-]*"),
    ]:
        m = re.search(pattern, raw_text, re.I)
        if m:
            online[label] = m.group(0) if m.group(0).startswith("http") else f"https://{m.group(0)}"

    return {
        "name": parsed_resume.get("name") or "Unknown",
        "email": parsed_resume.get("email"),
        "phone": parsed_resume.get("phone"),
        "total_experience_years": float(years or 0),
        "education": education,
        "work_history": work_history,
        "internships": internships,
        "skills": skills_split,
        "projects": proj_out,
        "certifications": certifications,
        "repo_urls": github_urls,
        "initiative_signals": ["github_active"] if github_urls else [],
        "online_presence": online,
        "resume_quality": {
            "has_clear_sections": bool(experience or education),
            "has_contact_info": bool(parsed_resume.get("email") or parsed_resume.get("phone")),
            "well_organized": len(raw_text) > 200,
        },
        "_raw_text": raw_text[:6000],
    }


def candidate_type(profile: dict, job_experience_level: str = "2 years") -> str:
    from pipelines.experience_utils import parse_experience_years

    years = float(profile.get("total_experience_years") or 0)
    if years >= 3:
        return "experienced"
    required = parse_experience_years(job_experience_level)
    if required >= 5:
        return "experienced"
    if required <= 1:
        return "fresher"
    return "fresher" if years < 3 else "experienced"
