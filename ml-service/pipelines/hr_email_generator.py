"""Professional HR emails — Groq only (payslip, leave, reimbursement, offers)."""



import json



from config import get_settings
from pipelines.groq_service import GroqApiError, groq_json, require_groq



_EMAIL_STYLES = (

    "Output a BODY FRAGMENT only (no <html>/<head>/<body> — the app wraps it in a responsive shell). "

    "Brand (Tailwind-aligned): aqua #00B8B8, heading #0D4F4F, cream #FFF4DE, body text #334155. "

    "Use inline styles on every element. Font stack: -apple-system, Segoe UI, sans-serif. "

    "Paragraphs: margin 0 0 14px; line-height 1.65; font-size 15px. "

    "Mobile-friendly: tables width 100%; max-width 100%; word-break break-word on long URLs/emails. "

    "CTA buttons: <a> with display:inline-block; padding 14px 28px; background #00B8B8; color #fff; "

    "border-radius 10px; font-weight 700; text-decoration none. "

    "Info blocks: background #EEEDFE; padding 16px; border-radius 10px; border-left 4px solid #7C6EF0."

)



_DETAILS_TABLE = (

    "MUST include <table class='email-stack' role='presentation' style='width:100%;max-width:100%;"

    "border-collapse:collapse;font-size:14px;margin:16px 0'> — stacks label/value on mobile. "

    "Each row: <tr><td style='padding:10px 12px;border:1px solid #e2e8f0;background:#f8fafc;"

    "font-weight:600;vertical-align:top'>Label</td>"

    "<td style='padding:10px 12px;border:1px solid #e2e8f0;word-break:break-word'>Value</td></tr>. "

    "Populate EVERY relevant field from Context JSON — do not omit candidate/employee details provided."

)



_HR_TO_HR = (

    "This is an internal notification TO HR, sent FROM the organization's HR Agent mailbox. "

    "Open with a clear one-line summary, then the details table, then action required + dashboard link."

)





def generate_hr_email(email_type: str, context: dict) -> dict:

    require_groq()

    ctx = json.dumps(context, default=str)[:7000]



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

        f"Organization: {context.get('org_name', 'XYZ')}\n"

        f"Sender agent: {context.get('sent_by_agent', context.get('agent_label', 'HR Agent'))}\n"

        f"Context JSON:\n{ctx}\n\n"

        f"{instruction}\n"

        f"{_EMAIL_STYLES}\n"

        f"{_DETAILS_TABLE}\n\n"

        "Return JSON: subject (string, specific with names/role), "

        "html (string, HTML fragment with table), preview_text (string)."

    )



    settings = get_settings()
    email_max_tokens = 2560 if email_type == "payslip" else 2048
    strong_model = getattr(settings, "groq_model_strong", None) or getattr(settings, "groq_model_fast", None)

    result = groq_json(
        "Expert HR communications writer. Output JSON only. Keep html concise — one table, brief prose.",
        prompt,
        strict=True,
        max_tokens=email_max_tokens,
        model=strong_model,
    )

    if not isinstance(result, dict) or not result.get("subject") or not result.get("html"):

        raise GroqApiError("Groq did not return a valid HR email (subject + html required).")

    return {

        "subject": str(result["subject"]).strip(),

        "html": str(result["html"]).strip(),

        "preview_text": str(result.get("preview_text") or "").strip(),

        "generated_by": "groq",

    }


