"""
Business orchestration service for page-level translation workflows.

Contains non-HTTP pipeline logic to keep API routers thin and focused.
"""

import asyncio
import base64
import logging
import re
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from app.services.detector import detect_bubbles
from app.services.inpainter import remove_text
from app.services.ocr import extract_text_from_image
from app.services.translator import translate_batch

logger = logging.getLogger(__name__)


NOISE_PATTERN = re.compile(r'^[\W_]+$')


def _clamp_box(box: List[int], width: int, height: int) -> Optional[List[int]]:
    """Clamp a detection box into image boundaries."""
    if len(box) != 4:
        return None

    x1, y1, x2, y2 = box
    x1 = max(0, min(int(x1), width))
    y1 = max(0, min(int(y1), height))
    x2 = max(0, min(int(x2), width))
    y2 = max(0, min(int(y2), height))

    if x2 <= x1 or y2 <= y1:
        return None
    return [x1, y1, x2, y2]


async def process_full_page(image_bytes: bytes, target_lang: str) -> List[Dict[str, Any]]:
    """
    Detect and translate all bubbles in a manga page image.

    Pipeline:
    1. Detect bubbles via YOLO detector.
    2. Decode full image with OpenCV.
    3. Crop each bubble region by [x1, y1, x2, y2].
    4. Run inpainting and translation for each crop.
    5. Return enriched bubble list with clean_image and translatedText.
    """
    detections = detect_bubbles(image_bytes)
    if not detections:
        return []

    # Sort bubbles in reading order: top-to-bottom, then left-to-right.
    detections = sorted(
        detections,
        key=lambda item: (
            int(item.get("box", [0, 0, 0, 0])[1]) if isinstance(item.get("box"), list) and len(item.get("box")) == 4 else 0,
            int(item.get("box", [0, 0, 0, 0])[0]) if isinstance(item.get("box"), list) and len(item.get("box")) == 4 else 0,
        ),
    )

    # Decode original page once for per-bubble cropping.
    img_array = np.frombuffer(image_bytes, dtype=np.uint8)
    page_image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if page_image is None:
        raise ValueError("Failed to decode uploaded image.")

    page_height, page_width = page_image.shape[:2]

    async def process_bubble(index: int, bubble: Dict[str, Any]) -> Dict[str, Any]:
        enriched = dict(bubble)
        enriched["index"] = index
        enriched["clean_image"] = None
        enriched["translatedText"] = ""
        enriched["ocr_text"] = ""
        enriched["ocr_confidence"] = 0.0

        box = bubble.get("box")
        if not isinstance(box, list):
            return enriched

        clamped_box = _clamp_box(box, page_width, page_height)
        if not clamped_box:
            return enriched

        x1, y1, x2, y2 = clamped_box
        crop = page_image[y1:y2, x1:x2]
        if crop.size == 0:
            return enriched

        success, encoded = cv2.imencode(".png", crop)
        if not success:
            logger.warning(f"Failed to encode crop for box: {clamped_box}")
            return enriched

        crop_bytes = encoded.tobytes()

        # Run OCR and inpainting concurrently for each bubble crop.
        ocr_result, clean_bytes = await asyncio.gather(
            extract_text_from_image(crop_bytes),
            asyncio.to_thread(remove_text, crop_bytes),
        )

        if isinstance(ocr_result, dict):
            text_value = ocr_result.get("text", "")
            if isinstance(text_value, str):
                enriched["ocr_text"] = text_value.strip()

            confidence_value = ocr_result.get("confidence", 0.0)
            try:
                enriched["ocr_confidence"] = float(confidence_value)
            except (TypeError, ValueError):
                enriched["ocr_confidence"] = 0.0

        if clean_bytes:
            enriched["clean_image"] = base64.b64encode(clean_bytes).decode("ascii")

        return enriched

    tasks = [process_bubble(index, bubble) for index, bubble in enumerate(detections)]
    enriched_bubbles = await asyncio.gather(*tasks)

    batch_payload: dict[str, str] = {}
    for bubble in enriched_bubbles:
        ocr_text = bubble.get("ocr_text", "")
        index = bubble.get("index")
        confidence = bubble.get("ocr_confidence", 0.0)

        if not isinstance(index, int) or not isinstance(ocr_text, str):
            continue

        normalized_text = ocr_text.strip()
        try:
            confidence_value = float(confidence)
        except (TypeError, ValueError):
            confidence_value = 0.0

        # Skip likely YOLO false positives and empty OCR outputs to save LLM tokens.
        if not normalized_text or confidence_value < 0.45:
            bubble["_skip"] = True
            continue

        # Keep punctuation/sound-effect text as-is to avoid unnecessary translation.
        if NOISE_PATTERN.match(normalized_text):
            bubble["_skip"] = True
            continue

        batch_payload[str(index)] = normalized_text

    translated_map: dict[str, str] = {}
    if batch_payload:
        translated_map = await translate_batch(batch_payload, target_lang)

    final_bubbles = []
    for bubble in enriched_bubbles:
        if bubble.pop("_skip", False):
            continue
        index = bubble.get("index")
        key = str(index) if isinstance(index, int) else ""
        if key in translated_map:
            bubble["translatedText"] = translated_map.get(key, "")
        bubble.pop("ocr_text", None)
        bubble.pop("ocr_confidence", None)
        bubble.pop("index", None)
        final_bubbles.append(bubble)

    logger.info(f"Translate-page complete: {len(final_bubbles)} bubbles processed")
    return final_bubbles
