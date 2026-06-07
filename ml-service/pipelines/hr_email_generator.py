"""Professional HR emails — Groq-first with compact prompts and template-style fallback."""

import html
import json
import logging

from config import get_settings
from pipelines.groq_service import GroqApiError, groq_json

logger = logging.getLogger(__name__)

_EMAIL_STYLES = (
    "Output a BODY FRAGMENT only (no <html>/<head>/<body> — the app wraps it in a responsive shell). "
    "NeuroHR brand (match the web app): aqua #00B8B8, heading #0D4F4F, body #1A6B6B, cream #FFF4DE, accent bg #E6FAF8. "
    "Use inline styles on every element. Font stack: -apple-system, Segoe UI, sans-serif. "
    "Paragraphs: margin 0 0 14px; line-height 1.65; font-size 15px; color #1A6B6B. "
    "Mobile-friendly: tables width 100%; max-width 100%; word-break break-word on long URLs/emails. "
    "CTA buttons: <a> with display:inline-block; padding 14px 28px; background #00B8B8; color #fff; "
    "border-radius 10px; font-weight 700; text-decoration none. "
    "Info blocks: background #E6FAF8; padding 16px; border-radius 10px; border-left 4px solid #00B8B8. "
    "Do NOT use purple/violet (#7C6EF0) or generic bootstrap blue."
)

_DETAILS_TABLE = (
    "MUST include <table class='email-stack' role='presentation' style='width:100%;max-width:100%;"
    "border-collapse:collapse;font-size:14px;margin:16px 0'> — stacks label/value on mobile. "
    "Each row: <tr><td style='padding:10px 12px;border:1px solid #F6E6C2;background:#E6FAF8;color:#0D4F4F;"
    "font-weight:600;vertical-align:top'>Label</td>"
    "<td style='padding:10px 12px;border:1px solid #F6E6C2;color:#1A6B6B;word-break:break-word'>Value</td></tr>. "
    "Populate EVERY relevant field from Context JSON — do not omit candidate/employee details provided."
)

_HR_TO_HR = (
    "This is an internal notification TO HR, sent FROM the organization's HR Agent mailbox. "
    "Open with a clear one-line summary, then the details table, then action required + dashboard link."
)

_LARGE_CONTEXT_KEYS = (
    "job_description",
    "briefing_html",
    "hr_message",
    "message",
    "candidate_note",
    "recommendation",
    "strengths",
    "concerns",
)

_CELL_LABEL = (
    "padding:10px 12px;border:1px solid #F6E6C2;background:#E6FAF8;color:#0D4F4F;"
    "font-weight:600;vertical-align:top"
)
_CELL_VALUE = "padding:10px 12px;border:1px solid #F6E6C2;color:#1A6B6B;word-break:break-word"


def _esc(value: object) -> str:
    return html.escape(str(value or "—"))


def _compact_email_context(context: dict) -> dict:
    out = dict(context or {})
    for key in _LARGE_CONTEXT_KEYS:
        val = out.get(key)
        if val is not None and str(val).strip():
            out[key] = str(val)[:1200]
    return out


def _details_table(rows: list[tuple[str, object]]) -> str:
    body = "".join(
        f"<tr><td style='{_CELL_LABEL}'>{_esc(label)}</td>"
        f"<td style='{_CELL_VALUE}'>{_esc(value)}</td></tr>"
        for label, value in rows
        if value is not None and str(value).strip() not in ("", "—")
    )
    return (
        f"<table class='email-stack' role='presentation' style='width:100%;border-collapse:collapse;"
        f"font-size:14px;margin:16px 0'>{body}</table>"
    )


def _cta(url: str, label: str) -> str:
    safe_url = _esc(url or "#")
    return (
        f"<p style='margin:20px 0'>"
        f"<a href='{safe_url}' style='display:inline-block;padding:14px 28px;background:#00B8B8;"
        f"color:#fff;border-radius:10px;font-weight:700;text-decoration:none'>{_esc(label)}</a>"
        f"</p>"
    )


def _build_fallback_email(email_type: str, context: dict) -> dict:
    """Branded HTML fragment when Groq/Gemini JSON fails."""
    c = context or {}
    org = c.get("org_name") or "NeuroHR"
    app_url = c.get("app_url") or c.get("portal_url") or "#"
    name = c.get("candidate_name") or c.get("employee_name") or "there"
    job = c.get("job_title") or "the role"

    if email_type == "offer_letter":
        subject = f"Congratulations! Offer — {job} at {org}"
        table = _details_table([
            ("Role", job),
            ("Department", c.get("department")),
            ("Employment type", c.get("employment_type")),
            ("Compensation", c.get("salary")),
            ("Start date", c.get("start_date")),
            ("Required skills", c.get("required_skills")),
        ])
        body = (
            f"<p>Hi {_esc(name)},</p>"
            f"<p>We are pleased to offer you the position of <strong>{_esc(job)}</strong> at {_esc(org)}.</p>"
            f"{table}"
            f"<p>Please accept or decline in the NeuroHR portal within <strong>5 business days</strong>.</p>"
            f"{_cta(c.get('portal_url') or app_url, 'Review & Respond to Offer')}"
            f"<p>Best regards,<br><strong>{_esc(org)} Hiring Team</strong></p>"
        )
    elif email_type == "screening_rejected_candidate":
        subject = f"Application Update — {job}"
        table = _details_table([
            ("Screening score", c.get("screening_score")),
            ("Threshold", c.get("threshold")),
        ])
        body = (
            f"<p>Hi {_esc(name)},</p>"
            f"<p>Thank you for applying for <strong>{_esc(job)}</strong> at {_esc(org)}.</p>"
            f"{table}"
            f"<p>We will not be moving forward at this time. We encourage you to apply for other roles.</p>"
            f"{_cta(app_url, 'View Job Openings')}"
        )
    elif email_type == "interview_rejected_candidate":
        subject = f"Application Update — {job}"
        table = _details_table([
            ("Screening score", c.get("screening_score")),
            ("Interview score", c.get("interview_score")),
            ("Composite score", c.get("composite_score")),
        ])
        body = (
            f"<p>Hi {_esc(name)},</p>"
            f"<p>Thank you for completing the AI interview for <strong>{_esc(job)}</strong>.</p>"
            f"{table}"
            f"<p>After review, we have decided to move forward with other candidates.</p>"
        )
    elif email_type == "interview_scheduled":
        subject = f"AI Interview Scheduled — {job}"
        table = _details_table([
            ("Deadline", c.get("deadline")),
            ("Portal", c.get("portal_url") or app_url),
        ])
        body = (
            f"<p>Hi {_esc(name)},</p>"
            f"<p>Your AI voice interview for <strong>{_esc(job)}</strong> is ready.</p>"
            f"{table}"
            f"{_cta(f'{app_url}/dashboard/interviews', 'Start My Interview')}"
        )
    elif email_type == "interview_completed":
        subject = f"Interview Complete — {job}"
        body = (
            f"<p>Hi {_esc(name)},</p>"
            f"<p>Thank you for completing your AI interview for <strong>{_esc(job)}</strong>.</p>"
            f"<p>Our hiring team will review your results within <strong>2–3 business days</strong>.</p>"
        )
    elif email_type == "offer_rejected_candidate":
        subject = f"Application Update — {job} at {org}"
        msg = f"<p>{_esc(c.get('hr_message'))}</p>" if c.get("hr_message") else ""
        body = (
            f"<p>Hi {_esc(name)},</p>"
            f"<p>Thank you for your time interviewing for <strong>{_esc(job)}</strong>.</p>"
            f"<p>We have decided to move forward with another candidate.</p>"
            f"{msg}"
        )
    elif email_type == "interview_result_hr":
        subject = f"Interview Result: {name} — {c.get('verdict') or 'Review'}"
        table = _details_table([
            ("Candidate", name),
            ("Role", job),
            ("Interview score", c.get("interview_score")),
            ("Composite score", c.get("composite_score")),
            ("Verdict", c.get("verdict")),
        ])
        body = (
            f"<p>AI interview completed — review required.</p>"
            f"{table}"
            f"{_cta(c.get('applications_url') or app_url, 'Review on Dashboard')}"
        )
    elif email_type == "offer_sent_hr":
        subject = f"Offer sent — {name} ({job})"
        table = _details_table([
            ("Candidate email", c.get("candidate_email")),
            ("Role", job),
            ("Salary", c.get("salary")),
            ("Start date", c.get("start_date")),
            ("Email sent", c.get("email_sent")),
        ])
        body = (
            f"<p>Offer letter sent to <strong>{_esc(name)}</strong> — awaiting portal response.</p>"
            f"{table}"
            f"{_cta(c.get('applications_url') or app_url, 'Open Applications')}"
        )
    elif email_type == "offer_accepted_hr":
        subject = f"Offer accepted — {name} ({job})"
        table = _details_table([
            ("New employee ID", c.get("new_employee_id")),
            ("Department", c.get("new_employee_department")),
            ("Responded at", c.get("responded_at")),
        ])
        body = (
            f"<p><strong>{_esc(name)}</strong> accepted the offer for <strong>{_esc(job)}</strong>.</p>"
            f"{table}"
            f"{_cta(c.get('applications_url') or app_url, 'Open Applications')}"
        )
    elif email_type == "offer_rejected_hr":
        subject = f"Offer declined — {name} ({job})"
        table = _details_table([
            ("Note", c.get("candidate_note")),
            ("Responded at", c.get("responded_at")),
        ])
        body = (
            f"<p><strong>{_esc(name)}</strong> declined the offer for <strong>{_esc(job)}</strong>.</p>"
            f"{table}"
            f"{_cta(c.get('applications_url') or app_url, 'Open Applications')}"
        )
    elif email_type == "final_rejected_hr":
        subject = f"Final rejection recorded — {name}"
        table = _details_table([
            ("Role", job),
            ("Screening score", c.get("screening_score")),
            ("Candidate email sent", c.get("email_sent")),
        ])
        body = (
            f"<p>Final rejection recorded for <strong>{_esc(name)}</strong>.</p>"
            f"{table}"
            f"{_cta(c.get('applications_url') or app_url, 'Open Applications')}"
        )
    elif email_type == "leave_request":
        subject = f"Leave request — {name}"
        table = _details_table([
            ("Employee", name),
            ("Leave type", c.get("leave_type")),
            ("Dates", c.get("date_range")),
            ("Days", c.get("days_requested")),
            ("Reason", c.get("reason")),
        ])
        body = (
            f"<p>New leave request requires HR review.</p>"
            f"{table}"
            f"{_cta(c.get('dashboard_url') or app_url, 'Review in Dashboard')}"
        )
    elif email_type == "reimbursement_request":
        subject = f"Reimbursement — {name}"
        table = _details_table([
            ("Employee", name),
            ("Category", c.get("category")),
            ("Amount", c.get("formatted_amount") or c.get("amount")),
            ("Description", c.get("description")),
        ])
        body = (
            f"<p>Reimbursement claim submitted.</p>"
            f"{table}"
            f"{_cta(c.get('dashboard_url') or app_url, 'Review in Dashboard')}"
        )
    elif email_type == "payslip":
        subject = f"Payslip — {c.get('month') or 'this month'} | {org}"
        table = _details_table([
            ("Employee ID", c.get("employee_id")),
            ("Net pay", c.get("net_pay")),
            ("Basic", c.get("basic")),
            ("Tax", c.get("tax")),
        ])
        body = (
            f"<p>Hi {_esc(name)},</p>"
            f"<p>Your payslip for <strong>{_esc(c.get('month'))}</strong> is attached.</p>"
            f"{table}"
        )
    else:
        subject = f"{org} notification"
        body = f"<p>{_esc(org)} — please check the dashboard for details.</p>{_cta(app_url, 'Open Dashboard')}"

    preview = " ".join(body.replace("<p>", " ").replace("</p>", " ").split())[:160]
    return {"subject": subject, "html": body, "preview_text": preview}


def generate_hr_email(email_type: str, context: dict) -> dict:
    compact_ctx = _compact_email_context(context)
    ctx = json.dumps(compact_ctx, default=str)[:4500]

    prompts = {
        "payslip": (
            "Write a SHORT payslip delivery email. Greeting + 2 sentences + compact details table "
            "(employee_id, designation, department, month, basic, allowance, bonus, tax, net_pay). "
            "Mention PDF attached. Keep html under 1500 characters."
        ),
        "leave_request": (
            f"{_HR_TO_HR} Employee LEAVE REQUEST. "
            "Details table must include: employee_name, employee_id, employee_email, employee_phone, "
            "department, designation, employment_type, leave_type, date_range, days_requested, "
            "leave_balances, exceeds_balance, reason, submitted_at. "
            "End with action_required and link to dashboard_url."
        ),
        "reimbursement_request": (
            f"{_HR_TO_HR} Employee REIMBURSEMENT claim. "
            "Details table: employee_name, employee_id, employee_email, department, designation, "
            "claim_id, category, formatted_amount, description, submitted_at. "
            "Ask HR to review in Payroll dashboard."
        ),
        "interview_scheduled": (
            "Write an email TO the candidate that their AI interview is scheduled. "
            "Details table: candidate_name, job_title, deadline, portal link. "
            "Include instructions to complete before deadline. Sent from HR Hiring team."
        ),
        "interview_completed": (
            "Write an email TO the candidate confirming AI interview submission. "
            "Details table: candidate_name, job_title. "
            "Say HR will review within 2-3 business days. Sent from HR Hiring team."
        ),
        "human_interview_candidate": (
            "Write an email TO the candidate with human panel interview details. "
            "Details table: candidate_name, job_title, interview_date, interview_time, "
            "duration_minutes, meet_link, interviewer names. Include join instructions. HR Hiring team."
        ),
        "human_interview_interviewer": (
            "Write an email TO a panel interviewer with human round details. "
            "Details table: interviewer_name, interviewer_role, candidate_name, job_title, "
            "interview_date, interview_time, meet_link, interview_score, composite_score, "
            "screening_score, ai_verdict. Embed briefing_html section with candidate insights. "
            "Note resume is attached. HR Hiring team."
        ),
        "interview_result_hr": (
            f"{_HR_TO_HR} AI interview completed — review required in Applications. "
            "Details table: candidate_name, job_title, interview_score, composite_score, "
            "screening_score, verdict, shortlist_verdict, strengths, concerns, recommendation."
        ),
        "recruiter_message": (
            "Write a professional email TO the candidate from HR recruiter with a custom message. "
            "Details table: candidate_name, job_title, message body. HR Hiring team."
        ),
        "offer_letter": (
            "Write a formal OFFER LETTER email TO the candidate. "
            "Include congratulations, details table (candidate_name, job_title, department, "
            "employment_type, salary, start_date, required_skills, leave_policy), "
            "brief role summary from job_description, portal_url to accept/decline, "
            "5 business day window, Hiring Team sign-off."
        ),
        "interview_rejected_candidate": (
            "Write a professional rejection email TO the candidate after HR reviewed their AI interview. "
            "Details table: candidate_name, job_title, screening_score, interview_score, "
            "composite_score, ai_verdict, matched_skills, hr_note. "
            "Thank them, be respectful, encourage future applications. Sent from HR Hiring team."
        ),
        "screening_rejected_candidate": (
            "Write a professional rejection email TO the candidate after resume screening. "
            "Details table: candidate_name, job_title, screening_score, threshold. "
            "Thank them, encourage future roles. Sent from HR Hiring team."
        ),
        "offer_rejected_candidate": (
            "Write a respectful rejection email TO the candidate after final interview round. "
            "Details table: candidate_name, job_title, department. "
            "Thank them, include hr_message if any, encourage future applications."
        ),
        "offer_sent_hr": (
            f"{_HR_TO_HR} Offer letter SENT to candidate — awaiting portal response. "
            "Details table: candidate_name, candidate_email, candidate_phone, job_title, department, "
            "employment_type, salary, start_date, screening_score, matched_skills, decided_by, "
            "email_sent status. Note onboarding happens only after candidate accepts."
        ),
        "offer_accepted_hr": (
            f"{_HR_TO_HR} Candidate ACCEPTED the offer — employee onboarded. "
            "Details table: candidate_name, candidate_email, candidate_phone, job_title, department, "
            "employment_type, salary, start_date, new_employee_id, new_employee_designation, "
            "new_employee_department, screening_score, matched_skills, job_description excerpt, "
            "candidate_note, responded_at, employee_onboarded. "
            "Congratulate HR team; list next onboarding steps."
        ),
        "offer_rejected_hr": (
            f"{_HR_TO_HR} Candidate DECLINED the offer. "
            "Details table: candidate_name, candidate_email, job_title, department, salary, "
            "start_date, candidate_note, responded_at. Suggest reopening role."
        ),
        "final_rejected_hr": (
            f"{_HR_TO_HR} Final rejection recorded. "
            "Details table: candidate_name, candidate_email, job_title, department, "
            "screening_score, email_sent. Confirm rejection email sent to candidate."
        ),
    }

    instruction = prompts.get(email_type, "Write a professional HR email with a details table.")
    prompt = (
        f"Email type: {email_type}\n"
        f"Organization: {compact_ctx.get('org_name', 'XYZ')}\n"
        f"Sender agent: {compact_ctx.get('sent_by_agent', compact_ctx.get('agent_label', 'HR Agent'))}\n"
        f"Context JSON:\n{ctx}\n\n"
        f"{instruction}\n"
        f"{_EMAIL_STYLES}\n"
        f"{_DETAILS_TABLE}\n\n"
        "Return JSON: subject (string, specific with names/role), "
        "html (string, HTML fragment with table), preview_text (string). "
        "Do NOT paste raw resume or JD text outside JSON string values."
    )

    settings = get_settings()
    email_max_tokens = 2560 if email_type == "payslip" else 2048
    strong_model = getattr(settings, "groq_model_strong", None) or getattr(settings, "groq_model_fast", None)

    generated_by = "groq"
    result = None
    try:
        result = groq_json(
            "Expert HR communications writer. Output JSON only. Keep html concise — one table, brief prose.",
            prompt,
            strict=False,
            max_tokens=email_max_tokens,
            min_output_tokens=1024,
            token_budget=8000,
            model=strong_model,
        )
    except GroqApiError as exc:
        logger.warning("Groq HR email failed, using fallback: %s", exc)

    if not isinstance(result, dict) or not result.get("subject") or not result.get("html"):
        logger.warning("Groq returned no valid HR email for %s — using template fallback", email_type)
        result = _build_fallback_email(email_type, compact_ctx)
        generated_by = "fallback"

    return {
        "subject": str(result["subject"]).strip(),
        "html": str(result["html"]).strip(),
        "preview_text": str(result.get("preview_text") or "").strip(),
        "generated_by": generated_by,
    }
