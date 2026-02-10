"""
Inpainting Service — Text Removal using OpenCV.

Removes text from manga speech bubble images using adaptive thresholding
and inpainting, producing a "clean" background image for overlay rendering.
"""

import logging
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def remove_text(image_bytes: bytes) -> Optional[bytes]:
    """
    Remove text from a manga speech bubble image using OpenCV inpainting.

    Pipeline:
        1. Decode bytes → BGR image
        2. Grayscale → Adaptive threshold → binary mask of text pixels
        3. Dilate mask to cover character edges
        4. cv2.inpaint (Telea algorithm) to fill text regions
        5. Encode result → PNG bytes

    Args:
        image_bytes: Raw image bytes (PNG, JPG, WEBP, etc.)

    Returns:
        PNG bytes of the cleaned image, or None if inpainting fails.
    """
    try:
        # Decode image bytes to OpenCV BGR format
        img_array = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

        if img is None:
            logger.warning("Failed to decode image for inpainting")
            return None

        # Convert to grayscale for text detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Adaptive threshold to detect dark text on light background
        # ADAPTIVE_THRESH_GAUSSIAN_C gives better results for varied lighting
        # blockSize=11, C=2 tuned for typical manga text
        mask = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            blockSize=11,
            C=2,
        )

        # Dilate the mask to cover character edges and anti-aliasing artifacts
        kernel = np.ones((3, 3), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=2)

        # Inpaint: fill text regions with surrounding colors
        # inpaintRadius=3 balances quality and speed
        inpainted = cv2.inpaint(img, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

        # Encode result as PNG
        success, encoded = cv2.imencode(".png", inpainted)
        if not success:
            logger.warning("Failed to encode inpainted image to PNG")
            return None

        logger.info(
            f"Inpainting complete: {len(image_bytes)} -> {len(encoded.tobytes())} bytes"
        )
        return encoded.tobytes()

    except Exception as e:
        logger.error(f"Inpainting failed: {e}")
        return None
