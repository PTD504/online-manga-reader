"""API Router for OCR testing endpoints."""

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas.ocr import OCRResponse
from app.services.ocr import extract_text_from_image

logger = logging.getLogger(__name__)

router = APIRouter(tags=["OCR"])


@router.post("/extract", response_model=OCRResponse)
async def extract_text_endpoint(file: UploadFile = File(...)) -> OCRResponse:
    """Extract text from an uploaded manga image using RapidOCR."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload an image file.",
        )

    try:
        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail="Empty file received.",
            )

        result = await extract_text_from_image(image_bytes)
        return OCRResponse(**result)

    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.error(f"Error in OCR extraction: {error}")
        raise HTTPException(
            status_code=500,
            detail=f"OCR extraction failed: {str(error)}",
        ) from error