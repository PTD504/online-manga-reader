"""OCR-related API schemas."""

from pydantic import BaseModel


class OCRResponse(BaseModel):
    """Response model for OCR extraction endpoint."""

    text: str
    confidence: float
    processing_time_ms: float