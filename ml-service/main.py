import os
import tempfile
import shutil
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pipelines.resume_parser import parse_resume
from pipelines.ranking_model import predict_suitability, train_ranking_model
from pipelines.jd_analyzer import analyze_job_description
from pipelines.interview_analyzer import generate_questions, analyze_answer, analyze_video_frame
from pipelines.interview_full_analyzer import analyze_full_interview
from pipelines.groq_service import GroqApiError, GroqNotConfiguredError
from pipelines.training_pipeline import train_model_pipeline, predict_with_model
from pipelines.chat_assistant import process_chat_message
from pipelines.document_intelligence import analyze_document
from pipelines.onboarding_generator import generate_onboarding_plan
from pipelines.hr_analytics import predict_performance, detect_payroll_anomaly
from pipelines.attendance_cv import verify_face
from config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.model_dir, exist_ok=True)
    os.makedirs(settings.data_dir, exist_ok=True)
    train_ranking_model()
    yield


app = FastAPI(
    title="NeuroHR AI ML Service",
    version="2.0.0",
    description="AI/ML Processing Engine for Enterprise HRMS & Recruitment Intelligence",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScreenRequest(BaseModel):
    parsed_resume: dict
    job_description: str
    job_title: str = ""
    job_skills: list[str] = []
    job_nice_to_have: list[str] = []
    job_experience_level: str = "2 years"


class ApplyProcessRequest(BaseModel):
    job_title: str = ""
    job_description: str = ""
    job_skills: list[str] = []
    job_nice_to_have: list[str] = []
    job_experience_level: str = "2 years"


class JDRequest(BaseModel):
    description: str
    company: str = ""


class JDGenerateRequest(BaseModel):
    role_title: str
    experience_level: str = "2 years"
    department: str = "Engineering"
    feedback: str = ""


class InterviewQuestionsRequest(BaseModel):
    job_title: str
    skills: list[str]
    count: int = 5
    job_description: str = ""


class AnalyzeAnswerRequest(BaseModel):
    question: str
    answer: str
    job_context: str = ""


class VideoAnalysisRequest(BaseModel):
    image: str


class TailoredQuestionsRequest(BaseModel):
    candidate: dict = {}
    screening_result: dict = {}
    skills_matrix: dict = {}
    tech_stack_profile: dict = {}
    job_description: str = ""
    count: int = 15


class FullInterviewRequest(BaseModel):
    questions: list = []
    answers: list = []
    job_context: str = ""
    video_analysis: dict = {}
    transcript: str = ""
    harness_transcript: list = []
    candidate_name: str = "Candidate"
    role_title: str = ""
    screening_score: float = 0


class InterviewerBriefingRequest(BaseModel):
    candidate_name: str = "Candidate"
    job_title: str = ""
    interviewer_name: str = "Interviewer"
    interviewer_role: str = "Panel Member"
    application: dict = {}
    screening: dict = {}
    interview: dict = {}


class TrainRequest(BaseModel):
    dataset_path: str
    config: dict


class PredictRequest(BaseModel):
    model_path: str
    features: dict


class ChatRequest(BaseModel):
    message: str
    context: dict = {}


class OnboardingRequest(BaseModel):
    candidate_data: dict
    position: str


class PerformanceRequest(BaseModel):
    employee_data: dict


class FaceVerifyRequest(BaseModel):
    image: str


class PayrollAnomalyRequest(BaseModel):
    payroll_data: dict


class SalarySuggestRequest(BaseModel):
    name: str = ""
    designation: str = "Developer"
    department: str = "Engineering"
    skills: list[str] = []


class HrEmailRequest(BaseModel):
    email_type: str
    context: dict = {}


class PayrollCalculateRequest(BaseModel):
    basic: int = 0
    allowance: int = 0
    bonus: int = 0
    deductions: int = 0
    tax_rate_pct: float = 10


@app.get("/")
async def root():
    return {
        "status": "healthy",
        "service": "neurohr-ml-service",
        "message": "ML API is running. Use /health or API routes under /api/*.",
        "health": "/health",
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "neurohr-ml-service"}


@app.post("/api/resume/parse")
async def api_parse_resume(file: UploadFile = File(...)):
    from pipelines.resume_parser import ResumeParseError
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename or ".pdf")[1]) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        result = parse_resume(tmp_path)
        return result
    except ResumeParseError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        os.unlink(tmp_path)


@app.post("/api/resume/screen")
async def api_screen_resume(data: ScreenRequest):
    from fastapi import HTTPException
    from pipelines.groq_service import GroqApiError, GroqNotConfiguredError
    from pipelines.resume_screener import screen_resume_against_jd
    try:
        return screen_resume_against_jd(
            data.parsed_resume,
            data.job_description,
            data.job_title,
            data.job_skills,
            data.job_experience_level,
            data.job_nice_to_have,
        )
    except (GroqNotConfiguredError, GroqApiError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/resume/apply-process")
async def api_apply_process(
    file: UploadFile = File(...),
    job_context: str = Form("{}"),
):
    """Parse resume + screen against JD in one call (single cold start on Render)."""
    import json
    from fastapi import HTTPException
    from pipelines.resume_parser import ResumeParseError, parse_resume
    from pipelines.groq_service import GroqApiError, GroqNotConfiguredError
    from pipelines.resume_screener import screen_resume_against_jd

    try:
        ctx = json.loads(job_context or "{}")
    except json.JSONDecodeError:
        ctx = {}

    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename or ".pdf")[1]) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        parsed = parse_resume(tmp_path)
        screening = screen_resume_against_jd(
            parsed,
            ctx.get("job_description") or ctx.get("description") or "",
            ctx.get("job_title") or ctx.get("title") or "",
            ctx.get("job_skills") or ctx.get("skills") or [],
            ctx.get("job_experience_level") or ctx.get("experience_level") or "2 years",
            ctx.get("job_nice_to_have") or ctx.get("nice_to_have_skills") or [],
        )
        return {"parsed": parsed, "screening": screening}
    except ResumeParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (GroqNotConfiguredError, GroqApiError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        os.unlink(tmp_path)


@app.post("/api/jd/analyze")
async def api_analyze_jd(data: JDRequest):
    from fastapi import HTTPException
    from pipelines.groq_service import GroqApiError, GroqNotConfiguredError
    try:
        return analyze_job_description(data.description, data.company)
    except (GroqNotConfiguredError, GroqApiError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/jd/generate-from-kb")
async def api_generate_jd_from_kb(data: JDGenerateRequest):
    from fastapi import HTTPException
    from pipelines.groq_service import GroqApiError, GroqNotConfiguredError
    from pipelines.jd_generator import draft_jd_from_kb
    try:
        return draft_jd_from_kb(
            role_title=data.role_title,
            experience_level=data.experience_level,
            department=data.department,
            feedback=data.feedback or None,
        )
    except (GroqNotConfiguredError, GroqApiError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/knowledgebase/status")
async def api_kb_status():
    from pipelines.knowledgebase import list_catalog_repos, read_index, ORG_NAME
    repos = list_catalog_repos()
    return {
        "org": ORG_NAME,
        "repos_count": len(repos),
        "repos": repos,
        "index_loaded": bool(read_index()),
    }


@app.post("/api/interview/generate-questions")
async def api_generate_questions(data: InterviewQuestionsRequest):
    return generate_questions(
        data.job_title,
        data.skills,
        data.count,
        data.job_description,
    )


@app.post("/api/interview/generate-tailored-questions")
async def api_generate_tailored_questions(data: TailoredQuestionsRequest):
    from fastapi import HTTPException
    from pipelines.groq_service import GroqApiError, GroqNotConfiguredError
    from pipelines.interview_question_generator import generate_tailored_questions
    try:
        return generate_tailored_questions(
            candidate=data.candidate,
            screening_result=data.screening_result,
            skills_matrix=data.skills_matrix,
            tech_stack_profile=data.tech_stack_profile,
            job_description=data.job_description,
            count=data.count or 15,
        )
    except (GroqNotConfiguredError, GroqApiError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/interview/analyze-answer")
async def api_analyze_answer(data: AnalyzeAnswerRequest):
    try:
        return analyze_answer(data.question, data.answer, data.job_context)
    except (GroqNotConfiguredError, GroqApiError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/interview/analyze-video")
async def api_analyze_video(data: VideoAnalysisRequest):
    return analyze_video_frame(data.image)


@app.post("/api/interview/interviewer-briefing")
async def api_interviewer_briefing(data: InterviewerBriefingRequest):
    from pipelines.interviewer_briefing import generate_interviewer_briefing
    return generate_interviewer_briefing(data.model_dump())


@app.post("/api/interview/analyze-full")
async def api_analyze_full_interview(data: FullInterviewRequest):
    try:
        return analyze_full_interview(
            questions=data.questions,
            answers=data.answers,
            job_context=data.job_context,
            video_analysis=data.video_analysis,
            transcript=data.transcript,
            harness_transcript=data.harness_transcript,
            candidate_name=data.candidate_name,
            role_title=data.role_title,
            screening_score=data.screening_score,
        )
    except (GroqNotConfiguredError, GroqApiError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/ml/train")
async def api_train_model(data: TrainRequest):
    config = data.config
    return train_model_pipeline(
        dataset_path=data.dataset_path,
        model_name=config.get("model_name", "custom_model"),
        algorithm=config.get("algorithm", "random_forest"),
        tuning_method=config.get("hyperparameter_tuning", "grid_search"),
        target_column=config.get("target_column", "label"),
    )


@app.post("/api/ml/predict")
async def api_predict(data: PredictRequest):
    return predict_with_model(data.model_path, data.features)


@app.post("/api/chat")
async def api_chat(data: ChatRequest):
    return process_chat_message(data.message, data.context)


@app.post("/api/document/analyze")
async def api_analyze_document(
    file: UploadFile = File(...),
    document_type: str = Form("resume"),
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename or ".pdf")[1]) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        return analyze_document(tmp_path, document_type)
    finally:
        os.unlink(tmp_path)


@app.post("/api/onboarding/generate")
async def api_generate_onboarding(data: OnboardingRequest):
    return generate_onboarding_plan(data.candidate_data, data.position)


@app.post("/api/hr/predict-performance")
async def api_predict_performance(data: PerformanceRequest):
    return predict_performance(data.employee_data)


@app.post("/api/attendance/verify-face")
async def api_verify_face(data: FaceVerifyRequest):
    return verify_face(data.image)


@app.post("/api/payroll/anomaly-detect")
async def api_payroll_anomaly(data: PayrollAnomalyRequest):
    return detect_payroll_anomaly(data.payroll_data)


@app.post("/api/payroll/suggest-salary")
async def api_suggest_salary(data: SalarySuggestRequest):
    from pipelines.payroll_generator import suggest_salary_structure
    return suggest_salary_structure(data.model_dump())


@app.post("/api/payroll/calculate")
async def api_calculate_payroll(data: PayrollCalculateRequest):
    from pipelines.payroll_generator import calculate_monthly_payroll
    return calculate_monthly_payroll(data.model_dump())


@app.post("/api/hr/generate-email")
async def api_generate_hr_email(data: HrEmailRequest):
    from fastapi import HTTPException
    from pipelines.groq_service import GroqApiError, GroqNotConfiguredError
    from pipelines.hr_email_generator import generate_hr_email
    try:
        return generate_hr_email(data.email_type, data.context)
    except (GroqNotConfiguredError, GroqApiError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/ml/train-upload")
async def api_train_upload(
    file: UploadFile = File(...),
    model_name: str = Form("custom_model"),
    algorithm: str = Form("random_forest"),
    target_column: str = Form("label"),
    hyperparameter_tuning: str = Form("grid_search"),
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        return train_model_pipeline(
            dataset_path=tmp_path,
            model_name=model_name,
            algorithm=algorithm,
            tuning_method=hyperparameter_tuning,
            target_column=target_column,
        )
    finally:
        os.unlink(tmp_path)
