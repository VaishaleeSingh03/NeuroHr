import re
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from pipelines.preprocessing import preprocess_pipeline, extract_skills_from_text
from pipelines.preprocessing import vectorize_texts


def compute_skill_match(resume_skills: list[str], jd_text: str) -> dict:
    jd_skills = extract_skills_from_text(jd_text)
    if not jd_skills:
        jd_skills = extract_skills_from_text(jd_text, [
            "communication", "teamwork", "problem solving", "leadership",
            "python", "java", "sql", "aws", "react", "machine learning",
        ])

    resume_set = {s.lower() for s in resume_skills}
    jd_set = {s.lower() for s in jd_skills}

    matched = [s for s in jd_skills if s.lower() in resume_set]
    missing = [s for s in jd_skills if s.lower() not in resume_set]

    match_pct = (len(matched) / max(len(jd_set), 1)) * 100

    return {
        "matched_skills": matched,
        "missing_skills": missing,
        "skill_match_percentage": round(match_pct, 2),
        "required_skills": jd_skills,
    }


def compute_experience_score(experience: list[dict], jd_text: str) -> float:
    years = 0
    for exp in experience:
        years = max(years, exp.get("years", 0))

    jd_lower = jd_text.lower()
    if "senior" in jd_lower or "lead" in jd_lower:
        required = 5
    elif "junior" in jd_lower or "entry" in jd_lower:
        required = 1
    else:
        required = 3

    score = min(100, (years / max(required, 1)) * 100)
    return round(score, 2)


def compute_education_relevance(education: list[dict], jd_text: str) -> float:
    if not education:
        return 50.0

    jd_lower = jd_text.lower()
    tech_keywords = ["computer", "engineering", "science", "technology", "it", "software", "data"]
    edu_text = " ".join(
        f"{e.get('institution', '')} {e.get('details', '')}" for e in education
    ).lower()

    relevance = 60.0
    if any(kw in edu_text for kw in tech_keywords):
        relevance += 20
    if "master" in edu_text or "phd" in edu_text:
        relevance += 15
    if "bachelor" in edu_text or "b.tech" in edu_text:
        relevance += 10

    return min(100, round(relevance, 2))


def compute_keyword_similarity(resume_text: str, jd_text: str) -> float:
    processed_resume = preprocess_pipeline(resume_text)
    processed_jd = preprocess_pipeline(jd_text)

    if not processed_resume or not processed_jd:
        return 50.0

    matrix, _ = vectorize_texts([processed_resume, processed_jd], max_features=1000)
    similarity = cosine_similarity(matrix[0:1], matrix[1:2])[0][0]
    return round(float(similarity) * 100, 2)


def compute_project_relevance(projects: list[dict], jd_text: str) -> float:
    if not projects:
        return 40.0

    jd_skills = extract_skills_from_text(jd_text)
    project_text = " ".join(
        f"{p.get('title', '')} {p.get('description', '')}" for p in projects
    ).lower()

    matches = sum(1 for s in jd_skills if s.lower() in project_text)
    return round(min(100, (matches / max(len(jd_skills), 1)) * 100 + 30), 2)


def compute_domain_matching(resume_text: str, jd_text: str) -> float:
    domains = {
        "software": ["developer", "engineer", "programming", "software", "full stack"],
        "data": ["data scientist", "machine learning", "analytics", "ai", "ml"],
        "devops": ["devops", "cloud", "infrastructure", "kubernetes", "docker"],
        "design": ["ui", "ux", "designer", "figma", "wireframe"],
    }

    jd_lower = jd_text.lower()
    resume_lower = resume_text.lower()

    jd_domain = None
    for domain, keywords in domains.items():
        if any(kw in jd_lower for kw in keywords):
            jd_domain = domain
            break

    if not jd_domain:
        return 70.0

    resume_domain = None
    for domain, keywords in domains.items():
        if any(kw in resume_lower for kw in keywords):
            resume_domain = domain
            break

    return 95.0 if jd_domain == resume_domain else 55.0


def engineer_features(parsed_resume: dict, job_description: str) -> dict:
    skill_data = compute_skill_match(parsed_resume.get("skills", []), job_description)

    features = {
        "skill_match_percentage": skill_data["skill_match_percentage"],
        "experience_score": compute_experience_score(parsed_resume.get("experience", []), job_description),
        "education_relevance": compute_education_relevance(parsed_resume.get("education", []), job_description),
        "project_relevance": compute_project_relevance(parsed_resume.get("projects", []), job_description),
        "keyword_similarity": compute_keyword_similarity(
            parsed_resume.get("raw_text", ""), job_description
        ),
        "domain_matching": compute_domain_matching(
            parsed_resume.get("raw_text", ""), job_description
        ),
    }

    return features, skill_data
