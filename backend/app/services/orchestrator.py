"""
Business orchestration service for page-level translation workflows.

Contains non-HTTP pipeline logic to keep API routers thin and focused.
"""

import asyncio
import base64
import logging
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from app.services.detector import detect_bubbles
from app.services.inpainter import remove_text
from app.services.translator import translate_image

logger = logging.getLogger(__name__)


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

    # Decode original page once for per-bubble cropping.
    img_array = np.frombuffer(image_bytes, dtype=np.uint8)
    page_image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if page_image is None:
        raise ValueError("Failed to decode uploaded image.")

    page_height, page_width = page_image.shape[:2]

    # Limit in-flight translation requests to keep API latency stable.
    semaphore = asyncio.Semaphore(4)

    async def process_bubble(bubble: Dict[str, Any]) -> Dict[str, Any]:
        enriched = dict(bubble)
        enriched["clean_image"] = None
        enriched["translatedText"] = ""

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

        async with semaphore:
            translation_task = translate_image(crop_bytes, target_lang)
            inpaint_task = asyncio.to_thread(remove_text, crop_bytes)
            translation_result, clean_bytes = await asyncio.gather(
                translation_task,
                inpaint_task,
            )

        if isinstance(translation_result, dict):
            translated = translation_result.get("translated", "")
            if isinstance(translated, str):
                enriched["translatedText"] = translated

        if clean_bytes:
            enriched["clean_image"] = base64.b64encode(clean_bytes).decode("ascii")

        return enriched

    tasks = [process_bubble(bubble) for bubble in detections]
    enriched_bubbles = await asyncio.gather(*tasks)

    logger.info(f"Translate-page complete: {len(enriched_bubbles)} bubbles processed")
    return enriched_bubbles
