"""AI-assisted salary structure and payroll calculation."""

from pipelines.groq_service import GroqApiError, groq_json, require_groq


def suggest_salary_structure(payload: dict) -> dict:
    require_groq()
    designation = payload.get("designation") or "Developer"
    department = payload.get("department") or "Engineering"
    skills = payload.get("skills") or []
    name = payload.get("name") or "Employee"

    result = groq_json(
        "You are an HR compensation analyst for an Indian tech company. Respond with JSON only.",
        f"""Suggest monthly salary structure for:
Name: {name}
Designation: {designation}
Department: {department}
Skills: {', '.join(skills[:12]) or 'N/A'}

Return JSON:
{{
  "basic": <monthly basic in INR integer>,
  "allowance": <monthly allowance integer>,
  "bonus": 0,
  "tax_rate_pct": 10,
  "monthly_tax_estimate": <integer>,
  "net_monthly_estimate": <integer>,
  "currency": "INR",
  "notes": "<one sentence rationale>"
}}""",
    )
    if not isinstance(result, dict) or not result.get("basic"):
        raise GroqApiError("Groq did not return a valid salary structure.")
    result["generated_by"] = "groq"
    return result


def calculate_monthly_payroll(payload: dict) -> dict:
    basic = int(payload.get("basic") or 0)
    allowance = int(payload.get("allowance") or 0)
    bonus = int(payload.get("bonus") or 0)
    deductions = int(payload.get("deductions") or 0)
    tax_rate = float(payload.get("tax_rate_pct") or 10)

    taxable = basic + allowance + bonus
    tax = round(taxable * (tax_rate / 100))
    net_pay = basic + allowance + bonus - deductions - tax

    return {
        "basic": basic,
        "allowance": allowance,
        "bonus": bonus,
        "deductions": deductions,
        "tax": tax,
        "net_pay": net_pay,
        "tax_rate_pct": tax_rate,
        "generated_by": "calculator",
    }
