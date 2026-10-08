"""Auth endpoints: POST /api/auth/login, GET /api/auth/me."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database.db import get_db
from app.models.entities import User
from app.security import create_token, get_current_user_optional, verify_password

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email (or plain username such as 'admin')")
    password: str


@router.post("/login")
def login(payload: LoginRequest, db=Depends(get_db)):
    identifier = payload.email.strip()
    candidates = [identifier]
    if "@" not in identifier:
        candidates.append(f"{identifier}@terraguard.local")
        candidates.append(identifier.lower())

    user = None
    for candidate in candidates:
        user = db.query(User).filter(User.email == candidate).first()
        if user is not None:
            break
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(user)
    return {
        "token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role},
    }


@router.get("/me")
def me(user=Depends(get_current_user_optional)):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user
