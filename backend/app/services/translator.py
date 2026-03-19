"""
Gemini Translation Service with Model Failover.

This module handles OCR and translation using Gemini Vision models.
Implements failover from primary to fallback model on rate limit errors.
"""

import json
import logging
import os
from typing import Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Model configuration with failover
PRIMARY_MODEL = "gemini-2.5-flash-lite"
FALLBACK_MODEL = "gemini-2.0-flash"


class TranslatorService:
    """
    Singleton Translation service using Google Gemini Vision API.
    Implements failover mechanism for rate limit handling.
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
        
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError(
                "GEMINI_API_KEY environment variable is not set. "
                "Please set it in your .env file."
            )
        
        logger.info("Initializing Gemini API client...")
        
        # Initialize the genai client
        self._client = genai.Client(api_key=api_key)
        
        TranslatorService._initialized = True
        logger.info(f"Gemini API client initialized. Primary: {PRIMARY_MODEL}, Fallback: {FALLBACK_MODEL}")
    
    def _detect_mime_type(self, image_bytes: bytes) -> str:
        """Detect image MIME type from bytes."""
        if image_bytes[:2] == b'\xff\xd8':
            return "image/jpeg"
        elif image_bytes[:4] == b'\x89PNG':
            return "image/png"
        elif image_bytes[:4] == b'RIFF' and len(image_bytes) > 12 and image_bytes[8:12] == b'WEBP':
            return "image/webp"
        elif image_bytes[:3] == b'GIF':
            return "image/gif"
        return "image/png"  # Default fallback
    
    def _build_system_instruction(self, target_lang: str) -> str:
        """Build the system instruction for professional manga translation."""
        return (
            f"You are a professional Manga Translator translating from Japanese to {target_lang}.\n"
            f"\n"
            f"## Context & Tone Rules\n"
            f"- Detect the tone and context from both the text content and visual cues in the image.\n"
            f"- If the scene looks aggressive, action-oriented, or confrontational: use \"Tao/Mày\" (Vietnamese).\n"
            f"- If the scene is a normal conversation or romance: use \"Tôi/Bạn\", \"Anh/Em\", or \"Cậu/Tớ\" as appropriate.\n"
            f"- Since you only see one speech bubble, infer context from the text content and any visible visual cues.\n"
            f"\n"
            f"## Output Format\n"
            f"- Return ONLY valid JSON with exactly two keys: \"original\" and \"translated\".\n"
            f"- Example: {{\"original\": \"<extracted text>\", \"translated\": \"<translated text>\"}}\n"
            f"- If no text is found, return: {{\"original\": \"\", \"translated\": \"\"}}\n"
            f"- Do NOT include any explanations, notes, or markdown.\n"
            f"\n"
            f"## Style Rules\n"
            f"- Keep translation concise to fit inside a speech bubble.\n"
            f"- Use natural, spoken language (văn nói) — NOT machine translation tone.\n"
            f"- Sound Effects (SFX): If detected, keep the original SFX or translate descriptively.\n"
        )

    def _build_prompt(self, target_lang: str) -> str:
        """Build the user-facing prompt (short, since system instruction handles rules)."""
        return (
            f"Extract the text from this manga speech bubble and translate it to {target_lang}. "
            f"Return the result as JSON."
        )
    
    async def _call_model(self, model: str, image_bytes: bytes, target_lang: str) -> dict:
        """
        Call a specific Gemini model for translation (async, non-blocking).
        
        Args:
            model: Model name to use.
            image_bytes: Image data.
            target_lang: Target language for translation.
            
        Returns:
            Dict with 'original' and 'translated' keys.
        """
        mime_type = self._detect_mime_type(image_bytes)
        prompt = self._build_prompt(target_lang)
        system_instruction = self._build_system_instruction(target_lang)
        
        # Build content with image and prompt
        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt
        ]
        
        # Configure generation with system instruction and native JSON output
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
        )
        
        logger.info(f"Calling {model} (async)...")
        
        # Use client.aio for native async — does NOT block the event loop
        response = await self._client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        
        if response and response.text:
            # Parse JSON response (native JSON mode ensures clean output)
            text = response.text.strip()
            
            # Handle markdown code blocks if present (safety fallback)
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1]) if len(lines) > 2 else text
            
            result = json.loads(text)
            logger.info(f"Success with {model}: {result.get('original', '')[:30]}...")
            return result
        
        return {"original": "", "translated": ""}
    
    async def translate_image(
        self,
        image_bytes: bytes,
        target_lang: str = "Vietnamese"
    ) -> dict:
        """
        Translate text from a manga speech bubble image.
        
        Uses PRIMARY_MODEL first, falls back to FALLBACK_MODEL on rate limit errors.
        
        Args:
            image_bytes: Image data (PNG, JPG, WEBP, etc.)
            target_lang: Target language for translation.
            
        Returns:
            Dict with 'original' and 'translated' keys.
        """
        if not image_bytes:
            logger.warning("Empty image bytes provided")
            return {"original": "", "translated": ""}
        
        # Step 1: Try primary model
        try:
            return await self._call_model(PRIMARY_MODEL, image_bytes, target_lang)
            
        except Exception as primary_error:
            error_str = str(primary_error).lower()
            
            # Check if it's a rate limit error (ResourceExhausted / 429)
            is_rate_limit = (
                "resourceexhausted" in error_str or
                "429" in error_str or
                "rate" in error_str or
                "quota" in error_str
            )
            
            if is_rate_limit:
                logger.warning(f"Rate limit on {PRIMARY_MODEL}, falling back to {FALLBACK_MODEL}")
            else:
                logger.warning(f"Error with {PRIMARY_MODEL}: {primary_error}, trying {FALLBACK_MODEL}")
            
            # Step 2: Try fallback model
            try:
                return await self._call_model(FALLBACK_MODEL, image_bytes, target_lang)
                
            except Exception as fallback_error:
                logger.error(f"Both models failed. Primary: {primary_error}, Fallback: {fallback_error}")
                return {"original": "", "translated": ""}


# Module-level singleton
_translator: Optional[TranslatorService] = None


def get_translator() -> TranslatorService:
    """Get the singleton translator instance."""
    global _translator
    if _translator is None:
        _translator = TranslatorService()
    return _translator


async def translate_image(
    image_bytes: bytes,
    target_lang: str = "Vietnamese"
) -> dict:
    """Convenience function to translate a single image."""
    translator = get_translator()
    return await translator.translate_image(image_bytes, target_lang)
