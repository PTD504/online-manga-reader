"""
API Router for Manga Translation endpoints.

This module defines the REST API endpoints for the manga translation service.
"""

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.ocr_engine import extract_text
from app.services.translator import translate_text

logger = logging.getLogger(__name__)

# Create API router - THIS MUST BE EXPORTED
router = APIRouter(tags=["Translation"])


class TranslationResponse(BaseModel):
    """Response model for translation endpoint."""
    original: str
    translated: str


@router.post("/translate-bubble", response_model=TranslationResponse)
async def translate_bubble(file: UploadFile = File(...)) -> TranslationResponse:
    """
    Translate text from a manga speech bubble image.
    
    Process: Image -> PaddleOCR -> Text -> Gemini API -> Translated Text
    
    Args:
        file: Image file of the manga speech bubble (PNG, JPG, etc.)
        
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
        
        # Step 1: Extract text using OCR
        logger.info("Step 1: OCR extraction...")
        original_text = extract_text(image_bytes)
        
        if not original_text:
            logger.warning("No text detected in image")
            return TranslationResponse(original="", translated="")
        
        # Step 2: Translate the extracted text
        logger.info("Step 2: Translation...")
        translated_text = await translate_text(original_text)
        
        logger.info("Translation pipeline complete")
        return TranslationResponse(
            original=original_text,
            translated=translated_text
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in translation pipeline: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Translation processing failed: {str(e)}"
        )