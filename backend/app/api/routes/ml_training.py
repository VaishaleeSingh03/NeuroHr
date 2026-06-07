import os
import uuid
import aiofiles
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db, get_next_id, utcnow
from app.models.enums import UserRole
from app.schemas.ml import ModelResponse, PredictionRequest
from app.core.auth import require_roles
from app.services.ml_client import ml_client
from app.config import get_settings

router = APIRouter(prefix="/ml", tags=["ML Training"])
settings = get_settings()


@router.post("/upload-dataset")
async def upload_dataset(
    file: UploadFile = File(...),
    user: dict = Depends(require_roles(UserRole.ADMIN)),
):
    os.makedirs(os.path.join(settings.upload_dir, "datasets"), exist_ok=True)
    filename = f"{uuid.uuid4()}_{file.filename}"
    filepath = os.path.join(settings.upload_dir, "datasets", filename)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(await file.read())

    return {"dataset_path": filepath, "filename": filename}


@router.post("/train", response_model=ModelResponse)
async def train_model(
    dataset_path: str = Form(...),
    model_name: str = Form("custom_model"),
    algorithm: str = Form("random_forest"),
    hyperparameter_tuning: str = Form("grid_search"),
    target_column: str = Form("label"),
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN)),
):
    config = {
        "model_name": model_name,
        "algorithm": algorithm,
        "hyperparameter_tuning": hyperparameter_tuning,
        "target_column": target_column,
    }
    result = await ml_client.train_model(dataset_path, config)

    model = {
        "id": await get_next_id("ml_models"),
        "model_name": model_name,
        "algorithm": algorithm,
        "version": result.get("version", "1.0.0"),
        "accuracy": result.get("accuracy", 0),
        "precision": result.get("precision", 0),
        "recall": result.get("recall", 0),
        "f1_score": result.get("f1_score", 0),
        "confusion_matrix": result.get("confusion_matrix", {}),
        "hyperparameters": result.get("hyperparameters", {}),
        "model_path": result.get("model_path", ""),
        "dataset_info": result.get("dataset_info", {}),
        "status": "trained",
        "created_at": utcnow(),
    }
    await database.ml_models.insert_one(model)
    return ModelResponse(**{k: v for k, v in model.items() if k != "_id"})


@router.get("/models", response_model=list[ModelResponse])
async def list_models(
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    cursor = database.ml_models.find({}, {"_id": 0}).sort("created_at", -1)
    models = await cursor.to_list(length=100)
    return [ModelResponse(**m) for m in models]


@router.post("/predict")
async def predict(
    data: PredictionRequest,
    database: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER)),
):
    model = await database.ml_models.find_one({"id": data.model_id}, {"_id": 0})
    if not model:
        raise HTTPException(404, "Model not found")

    return await ml_client.predict(model["model_path"], data.features)
