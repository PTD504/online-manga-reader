"""
Gemini Translation Service with Model Failover.

This module handles text translation using Gemini models.
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
    Singleton Translation service using Google Gemini API.
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

    def _build_single_system_instruction(self, target_lang: str) -> str:
        """Build system instruction for single text translation."""
        return (
            f"You are a professional Manga Translator translating from Japanese to {target_lang}.\n"
            f"\n"
            f"## Translation Rules\n"
            f"- Keep translation concise to fit inside a speech bubble.\n"
            f"- Use natural, spoken language (van noi) and avoid literal machine-like wording.\n"
            f"- OCR text may contain concatenated English words without spaces due to recognition limitations.\n"
            f"- If concatenated words are detected, split and normalize them before translating to preserve meaning.\n"
            f"\n"
            f"## Output Format\n"
            f"- Return ONLY valid JSON with exactly two keys: \"original\" and \"translated\".\n"
            f"- Example: {{\"original\": \"<source text>\", \"translated\": \"<target text>\"}}\n"
            f"- Do NOT include explanations, markdown, or code fences.\n"
        )

    def _build_batch_system_instruction(self, target_lang: str) -> str:
        """Build system instruction for batched text translation."""
        return (
            f"You are a professional Manga Translator translating from Japanese to {target_lang}.\n"
            f"\n"
            f"## Translation Rules\n"
            f"- Translate each input text value independently.\n"
            f"- OCR text may contain concatenated English words without spaces due to recognition limitations.\n"
            f"- If concatenated words are detected, split and normalize them before translating to preserve meaning.\n"
            f"- Keep translated lines concise and natural for manga speech bubbles.\n"
            f"\n"
            f"## Output Contract\n"
            f"- Return ONLY a raw JSON object with exactly the same keys as input.\n"
            f"- Each output value must be a translated string for its corresponding input key.\n"
            f"- Do NOT add, remove, rename, or reorder keys.\n"
            f"- Do NOT include explanations, markdown, or code fences.\n"
        )

    async def _call_model(self, model: str, prompt: str, system_instruction: str) -> dict:
        """
        Call a specific Gemini model for translation (async, non-blocking).
        
        Args:
            model: Model name to use.
            prompt: User prompt content.
            system_instruction: System instructions for model behavior.
            
        Returns:
            Parsed JSON object from model response.
        """
        # Configure generation with system instruction and native JSON output
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
        )
        
        logger.info(f"Calling {model} (async)...")
        
        # Use client.aio for native async — does NOT block the event loop
        response = await self._client.aio.models.generate_content(
            model=model,
            contents=prompt,
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
            logger.info(f"Success with {model}")
            return result
        raise ValueError("Model returned empty response.")

    async def _translate_with_failover(self, prompt: str, system_instruction: str) -> dict:
        """Translate with primary model and fallback on rate-limit or transient failures."""
        try:
            return await self._call_model(PRIMARY_MODEL, prompt, system_instruction)
        except Exception as primary_error:
            error_str = str(primary_error).lower()
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

            return await self._call_model(FALLBACK_MODEL, prompt, system_instruction)
    
    async def translate_text(
        self,
        text: str,
        target_lang: str = "Vietnamese"
    ) -> dict:
        """
        Translate a single OCR text string.
        
        Args:
            text: OCR text to translate.
            target_lang: Target language for translation.
            
        Returns:
            Dict with 'original' and 'translated' keys.
        """
        source_text = text.strip()
        if not source_text:
            return {"original": "", "translated": ""}

        system_instruction = self._build_single_system_instruction(target_lang)
        prompt = (
            "Translate the following OCR text to the target language and return JSON only.\n"
            f"source_text={json.dumps(source_text, ensure_ascii=False)}"
        )

        try:
            result = await self._translate_with_failover(prompt, system_instruction)
        except Exception as error:
            logger.error(f"Translation failed for single text: {error}")
            return {"original": source_text, "translated": ""}

        translated = result.get("translated", "") if isinstance(result, dict) else ""
        if not isinstance(translated, str):
            translated = str(translated)
        return {"original": source_text, "translated": translated}

    async def translate_batch(self, texts: dict[str, str], target_lang: str = "Vietnamese") -> dict[str, str]:
        """
        Translate a batch of OCR text values with one LLM call.

        Args:
            texts: Dictionary mapping bubble id/index to OCR text.
            target_lang: Target language for translation.

        Returns:
            Dictionary of translated texts with the exact same keys.
        """
        if not texts:
            return {}

        sanitized: dict[str, str] = {}
        for key, value in texts.items():
            key_str = str(key)
            value_str = value if isinstance(value, str) else str(value)
            sanitized[key_str] = value_str

        system_instruction = self._build_batch_system_instruction(target_lang)
        payload = json.dumps(sanitized, ensure_ascii=False)
        prompt = (
            "Translate all JSON values to the target language and preserve keys exactly. "
            "Return raw JSON only.\n"
            f"input_json={payload}"
        )

        try:
            result = await self._translate_with_failover(prompt, system_instruction)
        except Exception as error:
            logger.error(f"Batch translation failed: {error}")
            return {key: "" for key in sanitized.keys()}

        if not isinstance(result, dict):
            return {key: "" for key in sanitized.keys()}

        translated_map: dict[str, str] = {}
        for key in sanitized.keys():
            value = result.get(key, "")
            translated_map[key] = value if isinstance(value, str) else str(value)
        return translated_map


# Module-level singleton
_translator: Optional[TranslatorService] = None


def get_translator() -> TranslatorService:
    """Get the singleton translator instance."""
    global _translator
    if _translator is None:
        _translator = TranslatorService()
    return _translator


async def translate_text(
    text: str,
    target_lang: str = "Vietnamese"
) -> dict:
    """Convenience function to translate a single text string."""
    translator = get_translator()
    return await translator.translate_text(text, target_lang)


async def translate_image(
    text: str,
    target_lang: str = "Vietnamese"
) -> dict:
    """Backward-compatible alias for single text translation."""
    return await translate_text(text, target_lang)


async def translate_batch(
    texts: dict[str, str],
    target_lang: str = "Vietnamese"
) -> dict[str, str]:
    """Convenience function to translate a text batch."""
    translator = get_translator()
    return await translator.translate_batch(texts, target_lang)
