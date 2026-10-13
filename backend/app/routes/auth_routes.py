"""Auth endpoints: login, register and /me.

- POST /api/auth/login    — existing seed/demo accounts
- POST /api/auth/register — public self-service sign-up (default role VIEWER)
- GET  /api/auth/me       — current token owner

New accounts start as VIEWER on purpose: field reporting is open to them and
elevated roles (ANALYST/ADMIN) are only granted by an operator.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database.db import get_db
from app.models.entities import User
from app.security import (
    create_token,
    get_current_user_optional,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email (or plain username such as 'admin')")
    password: str


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., description="Valid email, lowercase")
    password: str = Field(..., min_length=8, max_length=200)


def _auth_payload(user: User) -> dict:
    return {
        "token": create_token(user),
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role},
    }


@router.post("/login")
def login(payload: LoginRequest, db=Depends(get_db)):
    identifier = payload.email.strip()
    candidates = [identifier]
    if "@" not in identifier:
        candidates.append(f"{identifier}@terraguard.local")
    # Emails are case-insensitive (registration lowercases them).
    candidates.append(identifier.lower())

    user = None
    for candidate in candidates:
        user = db.query(User).filter(User.email == candidate).first()
        if user is not None:
            break
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return _auth_payload(user)


@router.post("/register", status_code=201)
def register(payload: RegisterRequest, db=Depends(get_db)):
    name = payload.name.strip()
    email = payload.email.strip().lower()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required")
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=422, detail="A valid email is required")
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    existing = db.query(User).filter(User.email == email).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = User(
        name=name,
        email=email,
        hashed_password=hash_password(payload.password),
        role="VIEWER",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _auth_payload(user)


@router.get("/me")
def me(user=Depends(get_current_user_optional)):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user
