"""
API Schemas Module.

Pydantic models for database interactions and API responses.
These schemas correspond to Supabase database tables.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class UserUsageBase(BaseModel):
    """Base schema for user usage tracking."""
    
    translations_today: int = Field(default=0, ge=0)
    translations_total: int = Field(default=0, ge=0)
    last_translation_at: Optional[datetime] = None


class UserUsageCreate(UserUsageBase):
    """Schema for creating a new user usage record."""
    
    user_id: UUID


class UserUsage(UserUsageBase):
    """Schema for user usage with all fields."""
    
    id: UUID
    user_id: UUID
    subscription_tier: str = Field(default="free")
    daily_limit: int = Field(default=50)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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


class QuotaStatus(BaseModel):
    """Schema for quota status response."""
    
    translations_today: int
    daily_limit: int
    remaining: int
    subscription_tier: str
    reset_at: datetime
