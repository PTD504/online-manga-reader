"""
API Router for Manga Translation endpoints.

This module defines the REST API endpoints for the manga translation service.
Uses sequential processing with model failover for optimal Time-to-First-Token.
"""

import logging
from enum import Enum

from fastapi import APIRouter, File, HTTPException, UploadFile, Query
from pydantic import BaseModel

from app.services.translator import translate_image

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
    )
) -> TranslationResponse:
    """
    Translate text from a manga speech bubble image.
    
    Process: Image -> Gemini Vision (OCR + Translation) -> JSON Result
    
    Uses model failover: gemini-2.5-flash-lite -> gemini-2.0-flash on rate limits.
    
    Args:
        file: Image file (PNG, JPG, WEBP, etc.)
        target_lang: Target language for translation (dropdown selection)
        
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
        # Read image bytes
        logger.info(f"Processing image: {file.filename}")
        image_bytes = await file.read()
        
        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail="Empty file received."
            )
        
        # Translate using Gemini Vision with failover
        # Pass the enum value (string) to the translator
        result = await translate_image(image_bytes, target_lang.value)
        
        logger.info(f"Translation complete -> {target_lang.value}")
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