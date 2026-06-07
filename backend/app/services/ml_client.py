import httpx
from app.config import get_settings

settings = get_settings()


class MLClient:
    def __init__(self):
        self.base_url = settings.ml_service_url

    async def _post(self, endpoint: str, data: dict | None = None, files=None):
        async with httpx.AsyncClient(timeout=120.0) as client:
            if files:
                response = await client.post(f"{self.base_url}{endpoint}", data=data, files=files)
            else:
                response = await client.post(f"{self.base_url}{endpoint}", json=data)
            response.raise_for_status()
            return response.json()

    async def _get(self, endpoint: str):
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(f"{self.base_url}{endpoint}")
            response.raise_for_status()
            return response.json()

    async def parse_resume(self, file_path: str, filename: str):
        with open(file_path, "rb") as f:
            files = {"file": (filename, f)}
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(f"{self.base_url}/api/resume/parse", files=files)
                response.raise_for_status()
                return response.json()

    async def screen_resume(self, parsed_resume: dict, job_description: str):
        return await self._post("/api/resume/screen", {
            "parsed_resume": parsed_resume,
            "job_description": job_description,
        })

    async def analyze_jd(self, description: str, company: str = ""):
        return await self._post("/api/jd/analyze", {
            "description": description,
            "company": company,
        })

    async def generate_interview_questions(self, job_title: str, skills: list, count: int = 5):
        return await self._post("/api/interview/generate-questions", {
            "job_title": job_title,
            "skills": skills,
            "count": count,
        })

    async def analyze_interview_answer(self, question: str, answer: str, job_context: str):
        return await self._post("/api/interview/analyze-answer", {
            "question": question,
            "answer": answer,
            "job_context": job_context,
        })

    async def analyze_video_frame(self, image_base64: str):
        return await self._post("/api/interview/analyze-video", {"image": image_base64})

    async def train_model(self, dataset_path: str, config: dict):
        return await self._post("/api/ml/train", {"dataset_path": dataset_path, "config": config})

    async def predict(self, model_path: str, features: dict):
        return await self._post("/api/ml/predict", {"model_path": model_path, "features": features})

    async def chat(self, message: str, context: dict | None = None):
        return await self._post("/api/chat", {"message": message, "context": context or {}})

    async def analyze_document(self, file_path: str, doc_type: str):
        with open(file_path, "rb") as f:
            files = {"file": (file_path.split("/")[-1], f)}
            data = {"document_type": doc_type}
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/document/analyze", data=data, files=files
                )
                response.raise_for_status()
                return response.json()

    async def generate_onboarding(self, candidate_data: dict, position: str):
        return await self._post("/api/onboarding/generate", {
            "candidate_data": candidate_data,
            "position": position,
        })


ml_client = MLClient()
