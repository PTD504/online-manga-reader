"""Detection-related API schemas."""

from typing import List, Optional

from pydantic import BaseModel


class BoundingBox(BaseModel):
    """Bounding box coordinates."""

    x1: int
    y1: int
    x2: int
    y2: int


class Detection(BaseModel):
    """Single detection result."""

    label: str
    conf: float
    box: List[int]  # [x1, y1, x2, y2]
    polygon: Optional[List[List[int]]] = None  # [[x, y], ...]


class DetectionResponse(BaseModel):
    """Response model for detection endpoint."""

    detections: List[Detection]
    count: int
