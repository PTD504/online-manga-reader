"""
API Router for Manga Translation endpoints.

This module defines the REST API endpoints for the manga translation service.
Uses sequential processing with model failover for optimal Time-to-First-Token.
"""

import asyncio
import base64
import logging
import re
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile

from app.api.deps import get_current_user
from app.core.limiter import limiter
from app.schemas.translation import TargetLanguage, TranslationResponse
from app.services.credits import check_credits, deduct_credit, log_usage
from app.services.inpainter import remove_text
from app.services.ocr import extract_text_from_image
from app.services.orchestrator import process_full_page
from app.services.translator import translate_text

logger = logging.getLogger(__name__)

# Create API router
router = APIRouter(tags=["Translation"])


# Regex to detect noise: only symbols, punctuation, whitespace, or empty
NOISE_PATTERN = re.compile(r'^[\W_]*$')


@router.post("/translate-bubble", response_model=TranslationResponse)
@limiter.limit("20/minute")
async def translate_bubble(
    request: Request,
    file: UploadFile = File(...),
    target_lang: TargetLanguage = Query(
        default=TargetLanguage.VIETNAMESE,
        description="Target language for translation"
    ),
    source_image_url: str = Form(
        default="",
        description="Original image URL for pay-per-page idempotency"
    ),
    current_user: dict[str, Any] = Depends(get_current_user)
) -> TranslationResponse:
    """
    Translate text from a manga speech bubble image.
    
    Process: Image -> Gemini Vision (OCR + Translation) -> JSON Result
    
    Uses model failover: gemini-2.5-flash-lite -> gemini-2.0-flash on rate limits.
    
    Implements pay-per-page idempotency: if source_image_url was processed
    within the last 24 hours, no credit is deducted (free re-translation).
    
    Args:
        file: Image file (PNG, JPG, WEBP, etc.)
        target_lang: Target language for translation (dropdown selection)
        source_image_url: Original image URL for idempotency tracking
        
    Returns:
        TranslationResponse with original and translated text.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload an image file."
        )
    
    try:
        # Get user ID from authenticated user
        user_id = current_user["id"]
        
        # Check if user has credits (raises 402 if not)
        await check_credits(user_id)
        
        # Read image bytes
        logger.info(f"Processing image: {file.filename} for user {user_id}")
        image_bytes = await file.read()
        
        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail="Empty file received."
            )
        
        # Extract OCR text first, then translate text only to reduce LLM costs.
        ocr_result = await extract_text_from_image(image_bytes)
        original_text = ocr_result.get("text", "") if isinstance(ocr_result, dict) else ""
        
        # Smart filtering: detect noise (punctuation-only, empty, etc.)
        should_render = not NOISE_PATTERN.match(original_text)

        if not should_render:
            logger.info(f"Noise filtered out: '{original_text}'")
            return TranslationResponse(
                original=original_text,
                translated="",
                should_render=False,
                clean_image=None,
            )
        
        # Inpainting: remove text from bubble image (only if worth rendering)
        clean_image_b64: str | None = None
        try:
            # Run CPU-bound OpenCV in thread pool to keep async loop free
            clean_bytes = await asyncio.to_thread(remove_text, image_bytes)
            if clean_bytes:
                clean_image_b64 = base64.b64encode(clean_bytes).decode("ascii")
                logger.info("Inpainting successful")
            else:
                logger.warning("Inpainting returned None, frontend will use fallback")
        except Exception as inpaint_err:
            logger.error(f"Inpainting error: {inpaint_err}")

        # Translate plain OCR text instead of image payload.
        translation_result = await translate_text(original_text, target_lang.value)
        translated_text = ""
        if isinstance(translation_result, dict):
            translated = translation_result.get("translated", "")
            if isinstance(translated, str):
                translated_text = translated
        
        # Deduct credit and log usage after successful translation
        # Pass resource_id for idempotency (empty string -> None)
        resource_id = source_image_url.strip() if source_image_url else None
        await deduct_credit(user_id, resource_id=resource_id)
        await log_usage(user_id, tokens_spent=1, resource_id=resource_id)
        
        logger.info(f"Translation complete -> {target_lang.value}, credit deducted")
        return TranslationResponse(
            original=original_text,
            translated=translated_text,
            should_render=should_render,
            clean_image=clean_image_b64,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in translation: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Translation failed: {str(e)}"
        )


@router.post("/translate-page")
@limiter.limit("10/minute")
async def translate_page_endpoint(
    request: Request,
    file: UploadFile = File(...),
    target_lang: str = "Vietnamese"
) -> List[Dict[str, Any]]:
    """
    Detect and translate all bubbles in a manga page image.

    Pipeline:
    1. Detect bubbles via YOLO detector.
    2. Decode full image with OpenCV.
    3. Crop each bubble region by [x1, y1, x2, y2].
    4. Run inpainting and translation for each crop.
    5. Return enriched bubble list with clean_image and translatedText.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload an image file."
        )

    try:
        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail="Empty file received."
            )

        return await process_full_page(image_bytes, target_lang)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except FileNotFoundError as e:
        logger.error(f"Model file not found: {e}")
        raise HTTPException(
            status_code=503,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error in translate-page: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Translate-page failed: {str(e)}"
        )