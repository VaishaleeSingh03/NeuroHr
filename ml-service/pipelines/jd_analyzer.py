import re

from pipelines.preprocessing import preprocess_pipeline
from pipelines.groq_service import GroqApiError, groq_json, require_groq
from pipelines.experience_utils import normalize_experience_level


def analyze_job_description(description: str, company: str = "") -> dict:
    """Analyze a pasted/manual JD using Groq only — no OpenAI or regex fallback."""
    require_groq()
    if not description or not str(description).strip():
        raise GroqApiError("Job description is required for Groq analysis.")

    prompt = f"""Analyze this job description for company '{company or "Unknown"}':
{description[:8000]}

Return JSON with keys: required_skills (array), experience_level (string in years, e.g. "2 years", "3+ years", "0-2 years"),
difficulty_level (easy/medium/hard), candidate_expectations (array), salary_insights ({{currency, range_low, range_high, market_position}})

Do not generate interview questions — those are created when AI interview is scheduled."""

    result = groq_json(
        "You are an expert HR analyst. Analyze job descriptions and return structured JSON.",
        prompt,
        strict=True,
    )
    if not isinstance(result, dict):
        raise GroqApiError("Groq returned invalid JSON during JD analysis.")

    result["processed_description"] = preprocess_pipeline(description)[:2000]
    result.setdefault("candidate_expectations", [])
    result["interview_questions"] = []
    result.setdefault("required_skills", [])
    result["experience_level"] = normalize_experience_level(result.get("experience_level"))
    result["generated_by"] = "groq"
    return result


def is_software_role(job_title: str = "", description: str = "", skills: list[str] | None = None) -> bool:
    blob = f"{job_title} {description} {' '.join(skills or [])}".lower()
    software_signals = (
        "software", "developer", "engineer", "programmer", "devops", "sre",
        "frontend", "front-end", "backend", "back-end", "full stack", "fullstack",
        "web", "mobile", "android", "ios", "java", "python", "javascript", "typescript",
        "react", "node", "api", "microservice", "cloud", "database", "qa", "test automation",
    )
    return any(sig in blob for sig in software_signals)


def _extract_jd_responsibilities(description: str) -> list[str]:
    if not description:
        return []
    lines = re.split(r"[\n\r•\-–—]+", description)
    responsibilities = []
    for line in lines:
        text = line.strip()
        if len(text) < 20:
            continue
        lower = text.lower()
        if any(kw in lower for kw in (
            "responsible", "develop", "build", "design", "implement", "maintain",
            "collaborate", "deploy", "optimize", "write", "create", "integrate",
            "manage", "lead", "ensure", "work with", "experience in", "knowledge of",
        )):
            responsibilities.append(text[:220])
    return responsibilities[:8]


def generate_interview_questions_from_jd(
    description: str,
    skills: list[str],
    job_title: str = "",
    count: int = 6,
) -> list[dict]:
    """Build JD-only interview questions — technical-heavy for software roles."""
    questions: list[dict] = []
    seen: set[str] = set()
    software = is_software_role(job_title, description, skills)
    responsibilities = _extract_jd_responsibilities(description)

    technical_templates = {
        "python": [
            "Per the job requirements for Python: explain how you structure a production REST API and handle errors and validation.",
            "The JD expects Python expertise — walk through how you would optimize a slow data-processing pipeline.",
        ],
        "javascript": [
            "This role lists JavaScript — explain event loop behavior and how you debug async issues in production.",
            "How would you implement a reusable module in JavaScript that matches a requirement from this job description?",
        ],
        "typescript": [
            "The JD mentions TypeScript — how do you use types and interfaces to prevent runtime bugs in a large codebase?",
        ],
        "react": [
            "The job requires React — explain state management choices (Context, Redux, or hooks) for a feature described in the JD.",
            "How would you improve performance of a React app that must meet the responsibilities listed in this role?",
        ],
        "node": [
            "This role expects Node.js — describe how you design scalable APIs with authentication and rate limiting.",
            "How would you handle database connection pooling and error recovery in a Node.js service for this role?",
        ],
        "java": [
            "The JD lists Java — explain how you design thread-safe services and handle exceptions in enterprise code.",
            "Describe how you would implement a Spring Boot feature aligned with a core responsibility in this job description.",
        ],
        "spring": [
            "How would you structure layers (controller, service, repository) for a feature required by this JD?",
        ],
        "mongodb": [
            "The role requires MongoDB — how do you model schemas and indexes for query patterns in this job's domain?",
        ],
        "sql": [
            "Per the JD's database requirements: write and explain a query that joins multiple tables for a reporting use case.",
            "How would you optimize slow SQL queries for workloads described in this job description?",
        ],
        "docker": [
            "The JD mentions Docker — explain your multi-stage Dockerfile approach and how you keep images secure and small.",
        ],
        "kubernetes": [
            "How would you deploy and monitor the services described in this JD on Kubernetes?",
        ],
        "aws": [
            "The job lists AWS — design a highly available architecture for the main product responsibilities in the JD.",
        ],
        "api": [
            "Based on the JD's API responsibilities: how do you version REST APIs and document them for other teams?",
        ],
        "microservice": [
            "The role involves microservices — how would you handle inter-service communication and failure isolation?",
        ],
        "machine learning": [
            "The JD expects ML work — how would you evaluate and deploy a model that meets the stated business requirements?",
        ],
        "tensorflow": [
            "Explain how you would train and validate a model for a problem domain mentioned in this job description.",
        ],
        "git": [
            "How does your Git branching strategy support the delivery pace and collaboration described in this JD?",
        ],
        "agile": [
            "How do you break down a JD requirement into sprint-ready technical tasks and estimate complexity?",
        ],
    }

    def add_question(text: str, skill: str = "", qtype: str = "technical", difficulty: str = "medium"):
        key = text.lower()[:80]
        if key in seen or not text:
            return
        seen.add(key)
        questions.append({
            "question": text,
            "skill": skill,
            "type": qtype,
            "difficulty": difficulty,
        })

    # 1) Skill-specific technical questions from JD skills
    for skill in skills[:10]:
        skill_lower = skill.lower()
        matched = False
        for key, templates in technical_templates.items():
            if key in skill_lower:
                for template in templates:
                    add_question(template, skill=skill, qtype="technical")
                    if len(questions) >= count:
                        return questions[:count]
                matched = True
                break
        if not matched:
            if software:
                add_question(
                    f"The job description requires {skill}. Describe a real project where you used {skill} "
                    f"to deliver a feature similar to the responsibilities listed in this role.",
                    skill=skill,
                    qtype="technical",
                )
            else:
                add_question(
                    f"How does your experience with {skill} directly apply to a specific requirement in this job description?",
                    skill=skill,
                    qtype="jd_alignment",
                )

    # 2) Responsibility-based questions parsed from JD text
    for resp in responsibilities:
        if software:
            add_question(
                f"The JD states: \"{resp[:120]}...\" — explain your technical approach to delivering this, "
                "including architecture, tools, and trade-offs.",
                qtype="technical",
                difficulty="hard",
            )
        else:
            add_question(
                f"Regarding this JD requirement: \"{resp[:120]}...\" — how have you handled similar work?",
                qtype="jd_alignment",
            )
        if len(questions) >= count:
            return questions[:count]

    # 3) Software-role system design / depth fillers (still JD-tied)
    if software and description:
        stack = ", ".join(skills[:6]) if skills else "the technologies listed in the JD"
        fillers = [
            f"Design a system architecture for the main product described in this {job_title or 'software'} role using {stack}.",
            f"What technical risks would you anticipate for the responsibilities in this JD, and how would you mitigate them?",
            f"How would you implement automated testing and CI/CD for code that must meet the JD's quality expectations?",
            f"Walk through debugging a production incident for a service built with {stack} as required by this role.",
            f"How would you refactor legacy code to meet a new requirement explicitly mentioned in this job description?",
        ]
        for filler in fillers:
            add_question(filler, qtype="technical", difficulty="hard")
            if len(questions) >= count:
                return questions[:count]

    # 4) Last resort — still JD-referenced, never generic career questions
    while len(questions) < count and description:
        idx = len(questions) + 1
        add_question(
            f"Pick a specific requirement from this job description and explain step-by-step how you would implement it "
            f"using your strongest relevant skill (question {idx}).",
            qtype="jd_alignment",
        )

    return questions[:count]


def estimate_salary(level: str, skills: list, company: str) -> dict:
    base_ranges = {
        "entry": (50000, 75000),
        "mid": (75000, 120000),
        "senior": (120000, 180000),
    }
    low, high = base_ranges.get(level, (75000, 120000))
    premium_skills = {"machine learning", "aws", "kubernetes", "tensorflow", "pytorch"}
    premium = sum(1 for s in skills if s.lower() in premium_skills)
    adjustment = premium * 5000

    return {
        "currency": "USD",
        "range_low": low + adjustment,
        "range_high": high + adjustment,
        "market_position": "competitive" if premium >= 2 else "standard",
        "factors": ["experience_level", "skill_premium", "market_demand"],
    }


def generate_candidate_expectations(description: str, level: str) -> list[str]:
    level_label = normalize_experience_level(level)
    expectations = [
        f"Demonstrate expertise appropriate for {level_label} of experience in required technical skills",
        "Strong communication and collaboration abilities",
        "Ability to work in agile development environments",
        "Problem-solving mindset with attention to detail",
    ]

    if "remote" in description.lower():
        expectations.append("Self-motivated with excellent remote work discipline")
    if "lead" in description.lower():
        expectations.append("Proven leadership and mentoring experience")

    return expectations
