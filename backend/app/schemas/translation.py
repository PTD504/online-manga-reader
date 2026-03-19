"""Translation-related API schemas."""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class TargetLanguage(str, Enum):
    """Supported target languages for translation."""

    VIETNAMESE = "Vietnamese"
    ENGLISH = "English"
    JAPANESE = "Japanese"
    KOREAN = "Korean"
    CHINESE_SIMPLIFIED = "Chinese (Simplified)"
    CHINESE_TRADITIONAL = "Chinese (Traditional)"
    SPANISH = "Spanish"
    FRENCH = "French"
    PORTUGUESE = "Portuguese"
    INDONESIAN = "Indonesian"
    THAI = "Thai"
    RUSSIAN = "Russian"
    GERMAN = "German"
    ITALIAN = "Italian"
    ARABIC = "Arabic"
    HINDI = "Hindi"
    FILIPINO = "Filipino"
    POLISH = "Polish"
    TURKISH = "Turkish"
    UKRAINIAN = "Ukrainian"


class TranslationResponse(BaseModel):
    """Response model for translation endpoint."""

    original: str
    translated: str
    should_render: bool = True
    clean_image: str | None = None


class TranslationLogBase(BaseModel):
    """Base schema for translation log entries."""

    source_text: str = Field(default="", max_length=5000)
    translated_text: str = Field(default="", max_length=5000)
    source_lang: str = Field(default="auto", max_length=10)
    target_lang: str = Field(default="en", max_length=10)


class TranslationLogCreate(TranslationLogBase):
    """Schema for creating a new translation log entry."""

    user_id: UUID
    image_hash: Optional[str] = Field(default=None, max_length=64)


class TranslationLog(TranslationLogBase):
    """Schema for translation log with all fields."""

    id: UUID
    user_id: UUID
    image_hash: Optional[str] = None
    tokens_used: int = Field(default=0, ge=0)
    processing_time_ms: int = Field(default=0, ge=0)
    created_at: datetime

    class Config:
        from_attributes = True
