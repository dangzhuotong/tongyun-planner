from __future__ import annotations

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader

from .config import Settings, get_settings

_API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)
_BEARER_HEADER = APIKeyHeader(name="Authorization", auto_error=False)


def _extract_key(api_key: str | None, authorization: str | None) -> str | None:
    if api_key and api_key.strip():
        return api_key.strip()
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        return token or None
    return None


async def require_user(
    api_key: str | None = Security(_API_KEY_HEADER),
    authorization: str | None = Security(_BEARER_HEADER),
    settings: Settings = Depends(get_settings),
) -> str:
    """Resolve API key → user_id. Never log the key."""
    key = _extract_key(api_key, authorization)
    if not key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key (X-API-Key or Authorization: Bearer)",
        )
    user_id = settings.key_to_user.get(key)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )
    return user_id
