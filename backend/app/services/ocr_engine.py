"""
OCR Engine Service using PaddleOCR.

This module provides OCR functionality for extracting text from manga images.
Handles both horizontal and vertical text layouts.
"""

# --- MUST BE SET BEFORE IMPORTING PADDLEOCR ---
import os
os.environ['GLOG_minloglevel'] = '3'

import logging
from typing import Optional

import cv2
import numpy as np
from paddleocr import PaddleOCR

logger = logging.getLogger(__name__)


class OCREngine:
    """
    Singleton OCR Engine using PaddleOCR.
    Configured to handle both horizontal and vertical text.
    """
    
    _instance: Optional["OCREngine"] = None
    _initialized: bool = False
    
    def __new__(cls) -> "OCREngine":
        """Ensure only one instance of OCREngine exists."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self) -> None:
        """
        Initialize PaddleOCR with angle classification enabled.
        """
        if OCREngine._initialized:
            return
        
        logger.info("=" * 50)
        logger.info("Initializing PaddleOCR")
        logger.info("=" * 50)
        
        # Initialize with angle classification
        # This handles rotated text automatically
        self._ocr = PaddleOCR(
            use_angle_cls=True,        # Enable angle classification
            lang="en",                 # English model
        )
        
        OCREngine._initialized = True
        logger.info("PaddleOCR initialized successfully")
    
    def extract_text(self, image_bytes: bytes) -> str:
        """
        Extract text from an image, handling vertical manga text.
        
        Strategy:
        1. Try normal OCR first
        2. If result looks like vertical text (single chars), rotate image
        3. Re-run OCR on rotated image
        
        Args:
            image_bytes: Raw bytes of the image file.
            
        Returns:
            Concatenated string of all detected text blocks.
        """
        logger.info("Starting OCR extraction...")
        
        try:
            # Convert bytes to numpy array
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                logger.error("Failed to decode image")
                return ""
            
            # First attempt: Normal OCR
            result = self._ocr.ocr(image)
            
            if not result or not result[0]:
                logger.info("No text detected in image")
                return ""
            
            # Extract text and analyze
            texts = self._extract_texts_from_result(result)
            
            # Check if we got fragmented single characters (vertical text issue)
            if self._is_fragmented_text(texts):
                logger.info("Detected fragmented text - trying rotated image")
                
                # Try rotating 90 degrees clockwise
                rotated = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
                result_rotated = self._ocr.ocr(rotated)
                
                if result_rotated and result_rotated[0]:
                    texts_rotated = self._extract_texts_from_result(result_rotated)
                    
                    # Use rotated result if it's better
                    if not self._is_fragmented_text(texts_rotated):
                        logger.info("Rotated image gave better results")
                        texts = texts_rotated
            
            full_text = " ".join(texts)
            logger.info(f"Extracted: {full_text}")
            return full_text
            
        except Exception as e:
            logger.error(f"OCR Error: {e}", exc_info=True)
            return ""
    
    def _extract_texts_from_result(self, result) -> list[str]:
        """Extract text strings from OCR result."""
        texts = []
        for line in result[0]:
            if line and len(line) >= 2:
                text = line[1][0]
                texts.append(text)
        return texts
    
    def _is_fragmented_text(self, texts: list[str]) -> bool:
        """
        Detect if text is fragmented (single characters).
        This happens when vertical text is read horizontally.
        """
        if not texts:
            return False
        
        # If most texts are single characters, it's likely fragmented
        single_char_count = sum(1 for t in texts if len(t.strip()) == 1)
        fragmentation_ratio = single_char_count / len(texts)
        
        return fragmentation_ratio > 0.6  # More than 60% are single chars


# Module-level singleton
_ocr_engine: Optional[OCREngine] = None


def get_ocr_engine() -> OCREngine:
    """Get the singleton OCR engine instance."""
    global _ocr_engine
    if _ocr_engine is None:
        _ocr_engine = OCREngine()
    return _ocr_engine


def extract_text(image_bytes: bytes) -> str:
    """Convenience function to extract text from an image."""
    engine = get_ocr_engine()
    return engine.extract_text(image_bytes)