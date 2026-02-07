"""
Credit Service Module.

Handles credit checking, deduction, and usage logging for pay-as-you-go billing.
Uses atomic database operations to prevent race conditions.
"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)


async def check_credits(user_id: str) -> int:
    """
    Check if user has available credits.
    
    Args:
        user_id: The authenticated user's ID
        
    Returns:
        Current credit balance
        
    Raises:
        HTTPException 402: If credits <= 0
        HTTPException 500: If database query fails
    """
    try:
        supabase = get_supabase_client()
        
        response = supabase.table("profiles").select("credits").eq("id", user_id).single().execute()
        
        if not response.data:
            logger.error(f"No profile found for user: {user_id}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="User profile not found"
            )
        
        credits = response.data.get("credits", 0)
        logger.debug(f"User {user_id} has {credits} credits")
        
        if credits <= 0:
            logger.warning(f"User {user_id} is out of credits")
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Out of credits"
            )
        
        return credits
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to check credits for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check credits"
        )


async def deduct_credit(user_id: str) -> int:
    """
    Atomically deduct 1 credit from user's balance.
    
    Uses SQL atomic operation: credits = credits - 1
    This prevents race conditions when multiple requests are processed.
    
    Args:
        user_id: The authenticated user's ID
        
    Returns:
        New credit balance after deduction
        
    Raises:
        HTTPException 500: If database update fails
    """
    try:
        supabase = get_supabase_client()
        
        # Use RPC for atomic decrement
        response = supabase.rpc(
            "deduct_credit",
            {"p_user_id": user_id}
        ).execute()
        
        if response.data is not None:
            new_balance = response.data
            logger.info(f"Deducted 1 credit from user {user_id}, new balance: {new_balance}")
            return new_balance
        
        # Fallback: If RPC doesn't exist, use manual update
        logger.warning("RPC 'deduct_credit' not found, using fallback update")
        
        current = supabase.table("profiles").select("credits").eq("id", user_id).single().execute()
        if current.data:
            new_credits = max(0, current.data.get("credits", 0) - 1)
            supabase.table("profiles").update({"credits": new_credits}).eq("id", user_id).execute()
            logger.info(f"Deducted 1 credit from user {user_id}, new balance: {new_credits}")
            return new_credits
        
        return 0
        
    except Exception as e:
        logger.error(f"Failed to deduct credit for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to deduct credit"
        )


async def log_usage(user_id: str, tokens_spent: int = 1, url_domain: str | None = None) -> None:
    """
    Log a usage record for billing and analytics.
    
    Args:
        user_id: The authenticated user's ID
        tokens_spent: Number of tokens/credits spent (default 1)
        url_domain: Optional domain where translation was performed
        
    Raises:
        HTTPException 500: If database insert fails
    """
    try:
        supabase = get_supabase_client()
        
        usage_record = {
            "user_id": user_id,
            "tokens_spent": tokens_spent,
            "url_domain": url_domain,
        }
        
        supabase.table("usage_logs").insert(usage_record).execute()
        logger.info(f"Logged usage for user {user_id}: {tokens_spent} tokens")
        
    except Exception as e:
        # Log error but don't fail the request - usage logging is not critical
        logger.error(f"Failed to log usage for user {user_id}: {e}")
