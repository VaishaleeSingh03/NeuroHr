import os
import re
from pipelines.resume_parser import extract_text
from pipelines.preprocessing import extract_skills_from_text


def analyze_document(filepath: str, document_type: str = "resume") -> dict:
    text = ""
    ocr_confidence = 0.0

    ext = os.path.splitext(filepath)[1].lower()

    if ext in [".pdf", ".docx", ".doc"]:
        text = extract_text(filepath)
        ocr_confidence = 0.95 if text else 0.0
    elif ext in [".png", ".jpg", ".jpeg", ".tiff", ".bmp"]:
        text, ocr_confidence = _ocr_image(filepath)
    else:
        text = extract_text(filepath)
        ocr_confidence = 0.8

    if not text:
        text = "Unable to extract text from document."

    extracted_fields = _extract_fields(text, document_type)
    verification_score = _compute_verification_score(extracted_fields, document_type)
    analysis = _analyze_document_content(text, document_type)

    return {
        "extracted_text": text[:5000],
        "extracted_fields": extracted_fields,
        "verification_score": verification_score,
        "ocr_confidence": round(ocr_confidence * 100, 2),
        "analysis": analysis,
    }


def _ocr_image(filepath: str) -> tuple[str, float]:
    try:
        import pytesseract
        from PIL import Image

        image = Image.open(filepath)
        text = pytesseract.image_to_string(image)
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        confidences = [int(c) for c in data["conf"] if int(c) > 0]
        avg_conf = sum(confidences) / max(len(confidences), 1) / 100
        return text, avg_conf
    except Exception:
        return "", 0.0


def _extract_fields(text: str, doc_type: str) -> dict:
    fields = {}

    email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    if email_match:
        fields["email"] = email_match.group(0)

    phone_match = re.search(r"\+?\d[\d\s\-()]{7,}\d", text)
    if phone_match:
        fields["phone"] = phone_match.group(0)

    if doc_type == "certificate":
        cert_patterns = [
            r"certificate\s+(?:of|in)\s+([^\n]+)",
            r"certified\s+([^\n]+)",
            r"awarded\s+to\s+([^\n]+)",
        ]
        for pattern in cert_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                fields["certificate_name"] = match.group(1).strip()
                break

        date_match = re.search(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w+ \d{1,2},?\s*\d{4}", text)
        if date_match:
            fields["issue_date"] = date_match.group(0)

    elif doc_type == "id":
        id_patterns = [
            r"(?:ID|Identification)\s*(?:No|Number)?[:\s]*([A-Z0-9\-]+)",
            r"(?:Passport|License)\s*(?:No|Number)?[:\s]*([A-Z0-9\-]+)",
        ]
        for pattern in id_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                fields["id_number"] = match.group(1).strip()
                break

    elif doc_type == "resume":
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        if lines:
            fields["name"] = lines[0]
        fields["skills"] = extract_skills_from_text(text)

    return fields


def _compute_verification_score(fields: dict, doc_type: str) -> float:
    score = 40.0

    if fields.get("email"):
        score += 15
    if fields.get("phone"):
        score += 10

    if doc_type == "certificate":
        if fields.get("certificate_name"):
            score += 25
        if fields.get("issue_date"):
            score += 10
    elif doc_type == "id":
        if fields.get("id_number"):
            score += 30
    elif doc_type == "resume":
        if fields.get("name"):
            score += 15
        if fields.get("skills"):
            score += min(20, len(fields["skills"]) * 3)

    return round(min(100, score), 2)


def _analyze_document_content(text: str, doc_type: str) -> dict:
    word_count = len(text.split())
    return {
        "document_type": doc_type,
        "word_count": word_count,
        "has_contact_info": bool(re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)),
        "quality": "high" if word_count > 100 else "medium" if word_count > 30 else "low",
        "language": "english",
        "flags": _detect_flags(text, doc_type),
    }


def _detect_flags(text: str, doc_type: str) -> list[str]:
    flags = []
    if len(text) < 50:
        flags.append("insufficient_content")
    if doc_type == "id" and not re.search(r"\d", text):
        flags.append("no_id_numbers_detected")
    if "expired" in text.lower():
        flags.append("possibly_expired")
    return flags
