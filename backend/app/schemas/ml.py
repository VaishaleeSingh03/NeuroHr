from datetime import datetime
from pydantic import BaseModel


class ModelTrainRequest(BaseModel):
    model_name: str
    algorithm: str = "random_forest"
    hyperparameter_tuning: str = "grid_search"
    target_column: str = "label"


class ModelResponse(BaseModel):
    id: int
    model_name: str
    algorithm: str
    version: str
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    confusion_matrix: dict
    status: str
    created_at: datetime


class PredictionRequest(BaseModel):
    model_id: int
    features: dict
