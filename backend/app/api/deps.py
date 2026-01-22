"""
API Dependencies Module.

Contains FastAPI dependencies for authentication and other shared resources.
"""

import logging
from typing import Any, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)

# HTTP Bearer token security scheme
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict[str, Any]:
    """
    Dependency to get the current authenticated user from JWT token.
    
    Validates the JWT token using Supabase Auth and returns the user object.
    
    Args:
        credentials: HTTP Bearer credentials containing the JWT token
        
    Returns:
        User object from Supabase Auth
        
    Raises:
        HTTPException 401: If token is missing or invalid
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    
    try:
        supabase = get_supabase_client()
        
        # Verify token and get user
        response = supabase.auth.get_user(token)
        
        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user = response.user
        logger.debug(f"Authenticated user: {user.id}")
        
        return {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "created_at": str(user.created_at) if user.created_at else None,
            "user_metadata": user.user_metadata,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict[str, Any]]:
    """
    Dependency to optionally get the current user.
    
    Returns None if no token is provided, allowing endpoints to work
    for both authenticated and anonymous users.
    
    Args:
        credentials: Optional HTTP Bearer credentials
        
    Returns:
        User object if authenticated, None otherwise
    """
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
