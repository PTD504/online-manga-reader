"""
Translation Service using Google Gemini API (new google-genai SDK).

This module provides translation functionality for manga text using Gemini 2.0 Flash.
"""

import logging
import os
from typing import Optional

from dotenv import load_dotenv
from google import genai

logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()


class TranslatorService:
    """
    Singleton Translation service using Google Gemini API (new SDK).
    """
    
    _instance: Optional["TranslatorService"] = None
    _initialized: bool = False
    _client: Optional[genai.Client] = None
    
    def __new__(cls) -> "TranslatorService":
        """Ensure only one instance exists."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self) -> None:
        """Initialize the Gemini API client."""
        if TranslatorService._initialized:
            return
        
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError(
                "GOOGLE_API_KEY environment variable is not set. "
                "Please set it in your .env file."
            )
        
        logger.info("Initializing Gemini API client (google-genai SDK)...")
        
        # Initialize the new genai client
        self._client = genai.Client(api_key=api_key)
        
        TranslatorService._initialized = True
        logger.info("Gemini API client initialized successfully")
    
    async def translate_text(
        self,
        text: str,
        target_lang: str = "Vietnamese"
    ) -> str:
        """
        Translate text using Gemini API.
        
        Args:
            text: The source text to translate.
            target_lang: Target language for translation.
            
        Returns:
            Translated text string.
        """
        if not text or not text.strip():
            logger.warning("Empty text provided for translation")
            return ""
        
        try:
            # Build the manga translation prompt
            prompt = (
                f"You are a professional manga translator. "
                f"Translate the following text to {target_lang}. "
                f"Only return the translated text, no explanations.\n\n"
                f"{text}"
            )
            
            logger.info(f"Translating to {target_lang}: {text[:50]}...")
            
            # Generate translation using new SDK
            response = self._client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
            )
            
            if response and response.text:
                translated = response.text.strip()
                logger.info(f"Translation: {translated[:50]}...")
                return translated
            else:
                logger.warning("Empty response from Gemini API")
                return text
                
        except Exception as e:
            logger.error(f"Translation error: {e}")
            return text


# Module-level singleton
_translator: Optional[TranslatorService] = None


def get_translator() -> TranslatorService:
    """Get the singleton translator instance."""
    global _translator
    if _translator is None:
        _translator = TranslatorService()
    return _translator


async def translate_text(text: str, target_lang: str = "Vietnamese") -> str:
    """Convenience function to translate text."""
    translator = get_translator()
    return await translator.translate_text(text, target_lang)
