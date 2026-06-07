from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    context: dict | None = None


class ChatResponse(BaseModel):
    response: str
    sources: list[dict] | None = None
    action: str | None = None
