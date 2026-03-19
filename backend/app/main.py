"""
FastAPI Main Application Entry Point.

This module initializes the FastAPI application and configures all routes and services.
Includes Gemini Vision translation and YOLOv11 bubble detection.
"""

import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api_router import api_router
from app.core.constants import API_V1_PREFIX
from app.services.translator import get_translator
from app.services.detector import get_detector

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Pre-loads Gemini client and YOLO model on startup.
    """
    logger.info("Starting Manga Translator Backend...")
    
    # Initialize Gemini client
    try:
        get_translator()
        logger.info("Gemini API client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Gemini API client: {e}")
        raise
    
    # Initialize YOLO detector (pre-load model)
    try:
        get_detector()
        logger.info("YOLO bubble detector loaded successfully")
    except FileNotFoundError as e:
        logger.warning(f"YOLO model not found (detection disabled): {e}")
    except Exception as e:
        logger.warning(f"Failed to load YOLO detector: {e}")
    
    logger.info("Manga Translator Backend is ready!")
    
    yield
    
    logger.info("Shutting down Manga Translator Backend...")


# Create FastAPI application
app = FastAPI(
    title="Manga Translator API",
    description=(
        "Backend API for manga translation with:\n"
        "- **Bubble Detection**: YOLOv11 via ONNX Runtime\n"
        "- **OCR + Translation**: Gemini Vision with model failover"
    ),
    version="2.1.0",
    lifespan=lifespan,
)

# Configure CORS for browser extension access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(api_router, prefix=API_V1_PREFIX)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Manga Translator API",
        "version": "2.1.0",
        "features": ["detection", "translation"]
    }


@app.get("/health")
async def health_check():
    """Detailed health check endpoint."""
    return {
        "status": "healthy",
        "services": {
            "gemini_client": "available",
            "yolo_detector": "available"
        },
        "architecture": "Gemini Vision + YOLOv11 ONNX"
    }
