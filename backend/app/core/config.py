"""
Application Configuration Module.

Loads configuration from environment variables using pydantic-settings.
Includes Supabase credentials for authentication and database access.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Supabase Configuration
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""  # Service Role Key for backend admin operations

    # Optional: Supabase Anon Key if needed for specific operations
    SUPABASE_ANON_KEY: str = ""

    # Gemini API (existing)
    GEMINI_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Uses lru_cache to ensure settings are loaded only once.
    """
    return Settings()


# Global settings instance for easy import
settings = get_settings()
