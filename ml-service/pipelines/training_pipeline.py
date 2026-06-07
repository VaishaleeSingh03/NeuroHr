import os
import uuid
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import GridSearchCV, RandomizedSearchCV, train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
)
from config import get_settings

settings = get_settings()


def load_and_clean_dataset(filepath: str, target_column: str = "label") -> tuple:
    df = pd.read_csv(filepath)

    df = df.drop_duplicates()
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        df[col] = df[col].fillna(df[col].median())

    categorical_cols = df.select_dtypes(include=["object"]).columns
    for col in categorical_cols:
        if col != target_column:
            df[col] = df[col].fillna("unknown")

    for col in numeric_cols:
        Q1 = df[col].quantile(0.25)
        Q3 = df[col].quantile(0.75)
        IQR = Q3 - Q1
        lower = Q1 - 1.5 * IQR
        upper = Q3 + 1.5 * IQR
        df[col] = df[col].clip(lower, upper)

    return df, target_column


def engineer_training_features(df: pd.DataFrame, target_column: str) -> tuple:
    feature_cols = [c for c in df.columns if c != target_column]
    X = df[feature_cols].copy()
    y = df[target_column]

    encoders = {}
    for col in X.select_dtypes(include=["object"]).columns:
        le = LabelEncoder()
        X[col] = le.fit_transform(X[col].astype(str))
        encoders[col] = le

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    return X_scaled, y, scaler, encoders, feature_cols


def get_model(algorithm: str):
    models = {
        "random_forest": RandomForestClassifier(random_state=42),
        "gradient_boosting": GradientBoostingClassifier(random_state=42),
        "neural_network": MLPClassifier(hidden_layer_sizes=(128, 64), max_iter=1000, random_state=42),
        "logistic_regression": __import__("sklearn.linear_model", fromlist=["LogisticRegression"]).LogisticRegression(max_iter=1000),
    }
    return models.get(algorithm, models["random_forest"])


def get_param_grid(algorithm: str) -> dict:
    grids = {
        "random_forest": {
            "n_estimators": [50, 100, 200],
            "max_depth": [5, 10, 20, None],
            "min_samples_split": [2, 5],
        },
        "gradient_boosting": {
            "n_estimators": [50, 100],
            "learning_rate": [0.01, 0.1, 0.2],
            "max_depth": [3, 5, 7],
        },
        "neural_network": {
            "hidden_layer_sizes": [(64, 32), (128, 64), (256, 128, 64)],
            "alpha": [0.0001, 0.001, 0.01],
            "learning_rate_init": [0.001, 0.01],
        },
    }
    return grids.get(algorithm, {"n_estimators": [100]})


def train_model_pipeline(
    dataset_path: str,
    model_name: str,
    algorithm: str = "random_forest",
    tuning_method: str = "grid_search",
    target_column: str = "label",
) -> dict:
    os.makedirs(settings.model_dir, exist_ok=True)

    df, target = load_and_clean_dataset(dataset_path, target_column)
    X, y, scaler, encoders, feature_cols = engineer_training_features(df, target)

    if y.dtype == object or y.dtype.name == "category":
        le_target = LabelEncoder()
        y = le_target.fit_transform(y.astype(str))
    else:
        le_target = None

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = get_model(algorithm)
    param_grid = get_param_grid(algorithm)

    if tuning_method == "random_search":
        search = RandomizedSearchCV(model, param_grid, n_iter=10, cv=3, random_state=42, n_jobs=-1)
    else:
        search = GridSearchCV(model, param_grid, cv=3, n_jobs=-1)

    search.fit(X_train, y_train)
    best_model = search.best_estimator_

    y_pred = best_model.predict(X_test)
    cm = confusion_matrix(y_test, y_pred).tolist()

    avg = "weighted" if len(np.unique(y)) > 2 else "binary"
    metrics = {
        "accuracy": round(accuracy_score(y_test, y_pred), 4),
        "precision": round(precision_score(y_test, y_pred, average=avg, zero_division=0), 4),
        "recall": round(recall_score(y_test, y_pred, average=avg, zero_division=0), 4),
        "f1_score": round(f1_score(y_test, y_pred, average=avg, zero_division=0), 4),
        "confusion_matrix": {"matrix": cm, "labels": list(map(str, np.unique(y)))},
        "hyperparameters": search.best_params_,
    }

    model_id = str(uuid.uuid4())[:8]
    model_path = os.path.join(settings.model_dir, f"{model_name}_{model_id}.pkl")

    artifact = {
        "model": best_model,
        "scaler": scaler,
        "encoders": encoders,
        "feature_cols": feature_cols,
        "target_encoder": le_target,
        "algorithm": algorithm,
    }
    joblib.dump(artifact, model_path)

    return {
        **metrics,
        "model_path": model_path,
        "model_name": model_name,
        "version": f"1.0.{model_id}",
        "dataset_info": {
            "rows": len(df),
            "features": len(feature_cols),
            "target": target_column,
        },
    }


def predict_with_model(model_path: str, features: dict) -> dict:
    artifact = joblib.load(model_path)
    model = artifact["model"]
    scaler = artifact["scaler"]
    feature_cols = artifact["feature_cols"]
    encoders = artifact.get("encoders", {})

    row = {}
    for col in feature_cols:
        val = features.get(col, 0)
        if col in encoders:
            try:
                val = encoders[col].transform([str(val)])[0]
            except ValueError:
                val = 0
        row[col] = val

    X = np.array([[row[c] for c in feature_cols]])
    X_scaled = scaler.transform(X)
    prediction = model.predict(X_scaled)

    proba = None
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X_scaled)[0].tolist()

    return {
        "prediction": prediction[0].item() if hasattr(prediction[0], "item") else int(prediction[0]),
        "probabilities": proba,
        "features_used": feature_cols,
    }
