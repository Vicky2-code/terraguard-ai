"""JWT bearer authentication (PyJWT).

Roles: VIEWER < FIELD_OFFICER < ANALYST < ADMIN.

Auth is intentionally *additive*: public demo endpoints (dashboard, locations,
incidents, alerts, predict, weather, stream, ...) never require a token so the
deployed frontend works without login. A token unlocks role-aware UI bits and
is required only for admin mutations (settings changes).
"""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException

from app.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_ALGORITHM,
    JWT_SECRET,
    ROLE_ORDER,
)

PASSWORD_SALT = "terraguard-demo-salt"
PBKDF2_ITERATIONS = 60_000


def hash_password(password: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), PASSWORD_SALT.encode("utf-8"), PBKDF2_ITERATIONS
    ).hex()


def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed


def role_rank(role: Optional[str]) -> int:
    if not role:
        return -1
    try:
        return ROLE_ORDER.index(role.upper())
    except ValueError:
        return -1


def create_token(user) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None
    return parts[1].strip()


def get_current_user_optional(authorization: Optional[str] = Header(default=None)) -> Optional[dict]:
    """Parse the Authorization header; returns None when absent/invalid."""
    token = _extract_bearer(authorization)
    if not token:
        return None
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        return None
    return {
        "id": int(payload.get("sub", 0)),
        "name": payload.get("name", ""),
        "email": payload.get("email", ""),
        "role": payload.get("role", "VIEWER"),
    }


def require_role(min_role: str):
    """Dependency factory: 401 without a valid token, 403 below `min_role`."""

    def dependency(user: Optional[dict] = Depends(get_current_user_optional)) -> dict:
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        if role_rank(user.get("role")) < role_rank(min_role):
            raise HTTPException(status_code=403, detail=f"Requires {min_role} role or above")
        return user

    return dependency


# Convenience: contract-protected admin mutations.
require_admin = require_role("ADMIN")
