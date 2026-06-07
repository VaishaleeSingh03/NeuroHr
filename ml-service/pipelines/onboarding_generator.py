from datetime import datetime, timedelta
from pipelines.llm_service import is_available, chat_json


def generate_onboarding_plan(candidate_data: dict, position: str) -> dict:
    if is_available():
        result = chat_json(
            "You are an HR onboarding specialist. Generate personalized onboarding plans.",
            f"""Create onboarding plan for:
Name: {candidate_data.get('name')}
Position: {position}
Department: {candidate_data.get('department')}
Skills: {', '.join(candidate_data.get('skills', []))}
Start date: {candidate_data.get('start_date')}

Return JSON with: offer_letter (string), joining_checklist (array of {{task, due, owner, status}}),
training_plan ({{modules: array}}), day_30_plan, day_60_plan, day_90_plan (each with title, goals array),
documentation (array of {{name, type, required}})""",
        )
        if result:
            return result
    name = candidate_data.get("name", "Candidate")
    skills = candidate_data.get("skills", [])
    department = candidate_data.get("department", "Engineering")
    start_date = candidate_data.get("start_date", datetime.now().strftime("%Y-%m-%d"))

    offer_letter = _generate_offer_letter(name, position, department, start_date)
    checklist = _generate_checklist(name, start_date)
    training = _generate_training_plan(skills, position)
    day_30 = _generate_milestone_plan(30, skills, position, "foundation")
    day_60 = _generate_milestone_plan(60, skills, position, "growth")
    day_90 = _generate_milestone_plan(90, skills, position, "mastery")
    docs = _generate_documentation_list()

    return {
        "offer_letter": offer_letter,
        "joining_checklist": checklist,
        "training_plan": training,
        "day_30_plan": day_30,
        "day_60_plan": day_60,
        "day_90_plan": day_90,
        "documentation": docs,
    }


def _generate_offer_letter(name: str, position: str, department: str, start_date: str) -> str:
    return f"""OFFER OF EMPLOYMENT

Date: {datetime.now().strftime("%B %d, %Y")}

Dear {name},

We are pleased to offer you the position of {position} in our {department} department at TalentAI Nexus, commencing on {start_date}.

**Compensation Package:**
- Competitive base salary commensurate with experience
- Performance-based annual bonus eligibility
- Comprehensive health, dental, and vision insurance
- 401(k) with company matching
- Flexible PTO and remote work options

**Conditions:**
This offer is contingent upon successful completion of background verification and reference checks.

Please confirm your acceptance by signing and returning this letter within 5 business days.

We are excited about the possibility of you joining our team and contributing to our AI-powered recruitment revolution.

Sincerely,
TalentAI Nexus HR Department"""


def _generate_checklist(name: str, start_date: str) -> list[dict]:
    return [
        {"task": "Sign and return offer letter", "due": "Before start date", "owner": name, "status": "pending"},
        {"task": "Complete background verification", "due": "Before start date", "owner": "HR", "status": "pending"},
        {"task": "Submit ID and tax documents", "due": start_date, "owner": name, "status": "pending"},
        {"task": "IT equipment provisioning", "due": start_date, "owner": "IT", "status": "pending"},
        {"task": "Email and system account setup", "due": start_date, "owner": "IT", "status": "pending"},
        {"task": "Benefits enrollment", "due": "Within 30 days", "owner": name, "status": "pending"},
        {"task": "Complete security training", "due": "Week 1", "owner": name, "status": "pending"},
        {"task": "Meet with direct manager", "due": "Day 1", "owner": "Manager", "status": "pending"},
        {"task": "Team introduction session", "due": "Day 1", "owner": "HR", "status": "pending"},
        {"task": "Review 90-day success roadmap", "due": "Week 1", "owner": "Manager", "status": "pending"},
    ]


def _generate_training_plan(skills: list, position: str) -> dict:
    modules = [
        {"name": "Company Orientation", "duration": "4 hours", "type": "mandatory"},
        {"name": "Security & Compliance", "duration": "2 hours", "type": "mandatory"},
        {"name": "Tools & Systems Training", "duration": "8 hours", "type": "mandatory"},
    ]

    for skill in skills[:5]:
        modules.append({
            "name": f"{skill} — Team Standards & Best Practices",
            "duration": "4 hours",
            "type": "role_specific",
        })

    return {
        "position": position,
        "total_hours": sum(int(m["duration"].split()[0]) for m in modules),
        "modules": modules,
        "mentor_assigned": True,
        "completion_target_days": 30,
    }


def _generate_milestone_plan(day: int, skills: list, position: str, phase: str) -> dict:
    plans = {
        30: {
            "title": "30-Day Foundation Plan",
            "goals": [
                "Complete all mandatory onboarding training",
                "Deliver first independent task or contribution",
                "Establish working relationships with key stakeholders",
                "Understand team workflows and development processes",
            ],
            "kpis": ["Training completion: 100%", "First deliverable submitted", "3+ stakeholder meetings"],
        },
        60: {
            "title": "60-Day Growth Plan",
            "goals": [
                "Lead a small feature or improvement initiative",
                "Demonstrate proficiency in core role skills",
                "Participate in cross-team collaboration",
                "Receive positive mid-point feedback from manager",
            ],
            "kpis": ["Feature delivery on schedule", "Peer feedback score > 4/5", "Zero critical incidents"],
        },
        90: {
            "title": "90-Day Success Roadmap",
            "goals": [
                "Operate at full productivity independently",
                "Contribute to team planning and retrospectives",
                "Identify and propose process improvements",
                "Finalize long-term career development plan",
            ],
            "kpis": ["Full sprint contribution", "360 feedback completed", "Career plan documented"],
        },
    }

    plan = plans.get(day, plans[30])
    plan["phase"] = phase
    plan["target_date"] = (datetime.now() + timedelta(days=day)).strftime("%Y-%m-%d")
    plan["skill_focus"] = skills[:3]
    return plan


def _generate_documentation_list() -> list[dict]:
    return [
        {"name": "Employee Handbook", "type": "policy", "required": True},
        {"name": "Code of Conduct", "type": "policy", "required": True},
        {"name": "IT Security Policy", "type": "policy", "required": True},
        {"name": "Benefits Guide", "type": "reference", "required": True},
        {"name": "Org Chart", "type": "reference", "required": False},
        {"name": "Team Wiki", "type": "reference", "required": False},
        {"name": "Development Setup Guide", "type": "technical", "required": True},
    ]
