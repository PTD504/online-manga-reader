"""
API Router for Manga Translation endpoints.

This module defines the REST API endpoints for the manga translation service.
Uses sequential processing with model failover for optimal Time-to-First-Token.
"""

import logging
from enum import Enum
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Query
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.services.translator import translate_image
from app.services.credits import check_credits, deduct_credit, log_usage

logger = logging.getLogger(__name__)

# Create API router
router = APIRouter(tags=["Translation"])


class TargetLanguage(str, Enum):
    """Supported target languages for translation."""
    VIETNAMESE = "Vietnamese"
    ENGLISH = "English"
    JAPANESE = "Japanese"
    KOREAN = "Korean"
    CHINESE_SIMPLIFIED = "Chinese (Simplified)"
    CHINESE_TRADITIONAL = "Chinese (Traditional)"
    SPANISH = "Spanish"
    FRENCH = "French"
    PORTUGUESE = "Portuguese"
    INDONESIAN = "Indonesian"
    THAI = "Thai"
    RUSSIAN = "Russian"
    GERMAN = "German"
    ITALIAN = "Italian"
    ARABIC = "Arabic"
    HINDI = "Hindi"
    FILIPINO = "Filipino"
    POLISH = "Polish"
    TURKISH = "Turkish"
    UKRAINIAN = "Ukrainian"


class TranslationResponse(BaseModel):
    """Response model for translation endpoint."""
    original: str
    translated: str


@router.post("/translate-bubble", response_model=TranslationResponse)
async def translate_bubble(
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
        
        # Translate using Gemini Vision with failover
        result = await translate_image(image_bytes, target_lang.value)
        
        # Deduct credit and log usage after successful translation
        # Pass resource_id for idempotency (empty string -> None)
        resource_id = source_image_url.strip() if source_image_url else None
        await deduct_credit(user_id, resource_id=resource_id)
        await log_usage(user_id, tokens_spent=1, resource_id=resource_id)
        
        logger.info(f"Translation complete -> {target_lang.value}, credit deducted")
        return TranslationResponse(
            original=result.get("original", ""),
            translated=result.get("translated", "")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in translation: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Translation failed: {str(e)}"
        )