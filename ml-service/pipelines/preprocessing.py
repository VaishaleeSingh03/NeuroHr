import re
import string
import numpy as np
import nltk
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize
from sklearn.feature_extraction.text import TfidfVectorizer

for resource in ("punkt", "punkt_tab", "stopwords", "wordnet"):
    try:
        nltk.data.find(f"tokenizers/{resource}" if "punkt" in resource else f"corpora/{resource}")
    except LookupError:
        try:
            nltk.download(resource, quiet=True)
        except Exception:
            pass

lemmatizer = WordNetLemmatizer()
STOP_WORDS = set(stopwords.words("english"))


def clean_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"http\S+|www\S+", "", text)
    text = re.sub(r"\S+@\S+", " EMAIL ", text)
    text = re.sub(r"\+?\d[\d\s\-()]{7,}\d", " PHONE ", text)
    text = re.sub(r"[^a-zA-Z0-9\s+#.]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def tokenize(text: str) -> list[str]:
    cleaned = clean_text(text)
    try:
        return word_tokenize(cleaned)
    except LookupError:
        return cleaned.split()


def remove_stopwords(tokens: list[str]) -> list[str]:
    return [t for t in tokens if t not in STOP_WORDS and len(t) > 1]


def lemmatize_tokens(tokens: list[str]) -> list[str]:
    return [lemmatizer.lemmatize(t) for t in tokens]


def preprocess_pipeline(text: str) -> str:
    tokens = tokenize(text)
    tokens = remove_stopwords(tokens)
    tokens = lemmatize_tokens(tokens)
    return " ".join(tokens)


def vectorize_texts(texts: list[str], max_features: int = 5000) -> tuple:
    vectorizer = TfidfVectorizer(max_features=max_features, ngram_range=(1, 2))
    matrix = vectorizer.fit_transform(texts)
    return matrix, vectorizer


def extract_skills_from_text(text: str, skill_vocab: list[str] | None = None) -> list[str]:
    default_skills = [
        "python", "java", "javascript", "typescript", "react", "angular", "vue",
        "node.js", "nodejs", "sql", "mongodb", "postgresql", "aws", "azure", "gcp",
        "docker", "kubernetes", "machine learning", "deep learning", "tensorflow",
        "pytorch", "scikit-learn", "nlp", "computer vision", "opencv", "pandas",
        "numpy", "fastapi", "django", "flask", "spring", "c++", "c#", ".net",
        "agile", "scrum", "git", "ci/cd", "rest api", "graphql", "redis",
        "kafka", "spark", "hadoop", "tableau", "power bi", "excel", "linux",
        "html", "css", "tailwind", "next.js", "express", "microservices",
        "feature engineering", "data analysis", "statistics", "xgboost",
        "random forest", "neural network", "transformers", "huggingface",
        "langchain", "llm", "generative ai", "rag", "prompt engineering",
    ]
    vocab = skill_vocab or default_skills
    text_lower = text.lower()
    found = []
    for skill in vocab:
        if skill.lower() in text_lower:
            found.append(skill)
    return list(dict.fromkeys(found))
