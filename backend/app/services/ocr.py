"""Lightweight OCR service using RapidOCR ONNX Runtime."""

import asyncio
import time
from typing import Any

import cv2
import numpy as np
from rapidocr_onnxruntime import RapidOCR

# Initialize OCR engine once at module import time so model loading happens only once.
engine = RapidOCR(use_cls=False)


def _parse_ocr_results(result: Any) -> tuple[str, float]:
    """Parse RapidOCR result into concatenated text and average confidence."""
    if not result:
        return "", 0.0

    lines: list[str] = []
    confidences: list[float] = []

    for item in result:
        if not isinstance(item, (list, tuple)) or len(item) < 3:
            continue

        text = item[1]
        score = item[2]

        if isinstance(text, str):
            stripped = text.strip()
            if stripped:
                lines.append(stripped)

        try:
            confidences.append(float(score))
        except (ValueError, TypeError):
            pass

    final_text = "\n".join(lines)
    avg_confidence = (
        sum(confidences) / len(confidences)
        if confidences
        else 0.0
    )
    return final_text, avg_confidence


async def extract_text_from_image(image_bytes: bytes) -> dict:
    """Extract text from image bytes and return OCRResponse-compatible payload."""
    start_time = time.perf_counter()

    np_image = np.frombuffer(image_bytes, dtype=np.uint8)
    bgr_image = cv2.imdecode(np_image, cv2.IMREAD_COLOR)

    if bgr_image is None:
        raise ValueError("Unable to decode the uploaded image.")

    # Convert to grayscale so OCR focuses on text geometry in noisy manga bubbles.
    grayscale_image = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2GRAY)

    # Run CPU-bound OCR inference in a worker thread to avoid blocking the event loop.
    result, _elapse = await asyncio.to_thread(engine, grayscale_image)
    text, confidence = _parse_ocr_results(result)

    processing_time_ms = (time.perf_counter() - start_time) * 1000.0
    return {
        "text": text,
        "confidence": confidence,
        "processing_time_ms": processing_time_ms,
    }