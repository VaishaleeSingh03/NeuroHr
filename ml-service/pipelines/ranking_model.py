import os
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from pipelines.feature_engineering import engineer_features

MODEL_DIR = os.environ.get("MODEL_DIR", "./models")
RANKING_MODEL_PATH = os.path.join(MODEL_DIR, "ranking_model.pkl")
SCALER_PATH = os.path.join(MODEL_DIR, "ranking_scaler.pkl")

FEATURE_NAMES = [
    "skill_match_percentage",
    "experience_score",
    "education_relevance",
    "project_relevance",
    "keyword_similarity",
    "domain_matching",
]

WEIGHTS = {
    "skill_match_percentage": 0.30,
    "experience_score": 0.20,
    "education_relevance": 0.10,
    "project_relevance": 0.15,
    "keyword_similarity": 0.15,
    "domain_matching": 0.10,
}


def features_to_vector(features: dict) -> np.ndarray:
    return np.array([[features.get(f, 0) for f in FEATURE_NAMES]])


def weighted_score(features: dict) -> float:
    score = sum(features.get(k, 0) * v for k, v in WEIGHTS.items())
    return round(min(100, max(0, score)), 2)


def train_ranking_model(training_data: list[dict] | None = None):
    """Train ensemble ranking model on synthetic + real feature data."""
    os.makedirs(MODEL_DIR, exist_ok=True)

    if training_data:
        X = np.array([[d[f] for f in FEATURE_NAMES] for d in training_data])
        y = np.array([1 if d.get("label", d.get("ai_score", 50)) >= 70 else 0 for d in training_data])
    else:
        np.random.seed(42)
        n = 500
        X = np.random.rand(n, len(FEATURE_NAMES)) * 100
        y = (X[:, 0] * 0.3 + X[:, 1] * 0.2 + X[:, 4] * 0.2 + X[:, 2] * 0.1 > 55).astype(int)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    models = {
        "random_forest": RandomForestClassifier(n_estimators=100, random_state=42),
        "gradient_boosting": GradientBoostingClassifier(n_estimators=100, random_state=42),
        "logistic_regression": LogisticRegression(max_iter=1000, random_state=42),
        "neural_network": MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=500, random_state=42),
    }

    best_model = None
    best_score = 0
    for name, model in models.items():
        model.fit(X_scaled, y)
        score = model.score(X_scaled, y)
        if score > best_score:
            best_score = score
            best_model = model

    joblib.dump(best_model, RANKING_MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    return best_model, scaler


def load_ranking_model():
    if os.path.exists(RANKING_MODEL_PATH) and os.path.exists(SCALER_PATH):
        return joblib.load(RANKING_MODEL_PATH), joblib.load(SCALER_PATH)
    return train_ranking_model()


def predict_suitability(parsed_resume: dict, job_description: str) -> dict:
    features, skill_data = engineer_features(parsed_resume, job_description)
    base_score = weighted_score(features)

    try:
        model, scaler = load_ranking_model()
        X = features_to_vector(features)
        X_scaled = scaler.transform(X)
        proba = model.predict_proba(X_scaled)[0]
        ml_boost = proba[1] * 100 if len(proba) > 1 else proba[0] * 100
        final_score = round(base_score * 0.6 + ml_boost * 0.4, 2)
    except Exception:
        final_score = base_score

    return {
        "ai_score": float(final_score),
        "feature_scores": features,
        "skill_match": {
            "matched": skill_data["matched_skills"],
            "percentage": skill_data["skill_match_percentage"],
        },
        "missing_skills": skill_data["missing_skills"],
    }
