"""
FastAPI Main Application Entry Point.

This module initializes the FastAPI application and configures all routes and services.
"""

import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api import router as api_router
from app.services.ocr_engine import get_ocr_engine

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
    Pre-loads the OCR engine on startup to avoid cold start delays.
    """
    logger.info("Starting Manga Translator Backend...")
    logger.info("Pre-loading OCR engine...")
    
    try:
        get_ocr_engine()
        logger.info("OCR engine loaded successfully")
    except Exception as e:
        logger.error(f"Failed to initialize OCR engine: {e}")
        raise
    
    logger.info("Manga Translator Backend is ready!")
    
    yield
    
    logger.info("Shutting down Manga Translator Backend...")


# Create FastAPI application
app = FastAPI(
    title="Manga Translator API",
    description="Backend API for translating manga speech bubbles using OCR and AI translation.",
    version="1.0.0",
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

# Include API router
app.include_router(api_router)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Manga Translator API",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """Detailed health check endpoint."""
    return {
        "status": "healthy",
        "ocr_engine": "loaded",
        "translation_service": "available"
    }
