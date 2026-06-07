import numpy as np


def predict_performance(employee_data: dict) -> dict:
    skills = employee_data.get("skills") or []
    exp = employee_data.get("experience") or []
    ai_score = employee_data.get("aiPerformanceScore") or employee_data.get("ai_score") or 70
    salary = employee_data.get("salary") or {}
    basic = salary.get("basic", 50000) if isinstance(salary, dict) else 50000

    skill_factor = min(len(skills) * 4, 30)
    exp_years = sum(e.get("years", 1) for e in exp) if exp else 2
    exp_factor = min(exp_years * 3, 25)
    salary_factor = min(basic / 5000, 20)

    performance_score = round(min(98, ai_score * 0.4 + skill_factor + exp_factor + salary_factor), 1)
    promotion_chance = round(min(95, performance_score * 0.85 + skill_factor * 0.3), 1)
    attrition_risk = round(max(5, 100 - performance_score * 0.7 - exp_factor), 1)

    rec_skills = _recommend_skills(skills)
    return {
        "performance_score": performance_score,
        "promotion_chance": promotion_chance,
        "attrition_risk": attrition_risk,
        "skill_recommendations": rec_skills,
        "growth_analysis": _growth_text(performance_score, promotion_chance),
    }


def _recommend_skills(current: list) -> list:
    pool = ["Leadership", "Cloud Architecture", "Data Analytics", "Agile", "Communication",
            "Machine Learning", "Project Management", "DevOps", "Python", "React"]
    missing = [s for s in pool if s not in current]
    return missing[:5]


def _growth_text(perf: float, promo: float) -> str:
    if promo >= 75:
        return "High growth trajectory — strong promotion candidate"
    if perf >= 70:
        return "Steady performer with consistent growth potential"
    return "Development focus recommended — upskilling advised"


def detect_payroll_anomaly(payroll_data: dict) -> dict:
    basic = payroll_data.get("basic", 0)
    allowance = payroll_data.get("allowance", 0)
    bonus = payroll_data.get("bonus", 0)
    deductions = payroll_data.get("deductions", 0)
    tax = payroll_data.get("tax", 0)
    net = payroll_data.get("netPay", 0)

    expected_net = basic + allowance + bonus - deductions - tax
    deviation = abs(net - expected_net)
    anomaly = deviation > 100 or bonus > basic * 0.5 or deductions > basic * 0.3

    avg_salary = basic + allowance
    predicted_next = round(avg_salary * (1.03 + np.random.uniform(-0.01, 0.02)), 2)

    return {
        "anomaly_detected": anomaly,
        "deviation_amount": round(deviation, 2),
        "predicted_next_month": predicted_next,
        "salary_trend": "increasing" if bonus > 0 else "stable",
        "risk_level": "high" if anomaly else "low",
        "recommendation": "Review payroll entry" if anomaly else "Payroll within normal range",
    }
