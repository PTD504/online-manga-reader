"""
Supabase Client Module.

Initializes and provides the Supabase client for database and auth operations.
"""

import logging
from functools import lru_cache

from supabase import create_client, Client

from .config import settings

logger = logging.getLogger(__name__)


@lru_cache
def get_supabase_client() -> Client:
    """
    Get cached Supabase client instance.
    
    Uses the Service Role Key for backend admin operations.
    This client can bypass RLS policies when needed.
    
    Returns:
        Supabase Client instance
        
    Raises:
        ValueError: If Supabase credentials are not configured
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        logger.error("Supabase credentials not configured")
        raise ValueError(
            "SUPABASE_URL and SUPABASE_KEY must be set in environment variables"
        )
    
    logger.info("Initializing Supabase client...")
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    logger.info("Supabase client initialized successfully")
    
    return client
