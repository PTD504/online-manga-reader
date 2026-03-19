"""Version 1 API router composition."""

from fastapi import APIRouter

from app.api.v1.endpoints.detection import router as detection_router
from app.api.v1.endpoints.translations import router as translations_router

api_router = APIRouter()
api_router.include_router(translations_router)
api_router.include_router(detection_router)
