"""
API Router for Bubble Detection endpoints.

This module defines the REST API endpoints for YOLOv11 bubble detection.
"""

import logging

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from app.core.limiter import limiter
from app.schemas.detection import Detection, DetectionResponse
from app.services.detector import detect_bubbles

logger = logging.getLogger(__name__)

# Create API router
router = APIRouter(tags=["Detection"])


@router.post("/detect", response_model=DetectionResponse)
@limiter.limit("30/minute")
async def detect_bubbles_endpoint(
    request: Request,
    file: UploadFile = File(...)
) -> DetectionResponse:
    """
    Detect speech bubbles in a manga page image.
    
    Uses YOLOv11 model via ONNX Runtime for efficient inference.
    
    Args:
        file: Image file of a manga page (PNG, JPG, WEBP, etc.)
        
    Returns:
        DetectionResponse with list of detected bubbles and their bounding boxes.
        Each box is in [x1, y1, x2, y2] format (top-left and bottom-right corners).
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload an image file."
        )
    
    try:
        # Read image bytes
        logger.info(f"Detecting bubbles in: {file.filename}")
        image_bytes = await file.read()
        
        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail="Empty file received."
            )
        
        # Run detection
        results = detect_bubbles(image_bytes)
        
        logger.info(f"Detection complete: {len(results)} bubbles found")
        return DetectionResponse(
            detections=[Detection(**r) for r in results],
            count=len(results)
        )
        
    except HTTPException:
        raise
    except FileNotFoundError as e:
        logger.error(f"Model file not found: {e}")
        raise HTTPException(
            status_code=503,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error in detection: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Detection failed: {str(e)}"
        )

