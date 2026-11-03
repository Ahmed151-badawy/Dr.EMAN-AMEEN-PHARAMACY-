import os
import time
import json
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.models.user import User
from app.schemas.user import Token, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

RATE_LIMIT_FILE = "/tmp/failed_logins.json"
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_WINDOW_SECONDS = 60.0


def _get_attempts_store() -> dict:
    try:
        if os.path.exists(RATE_LIMIT_FILE):
            with open(RATE_LIMIT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_attempts_store(data: dict) -> None:
    try:
        with open(RATE_LIMIT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception:
        pass


def check_login_rate_limit(client_ip: str) -> None:
    now = time.time()
    store = _get_attempts_store()
    attempts = [t for t in store.get(client_ip, []) if now - t < LOCKOUT_WINDOW_SECONDS]
    store[client_ip] = attempts
    _save_attempts_store(store)
    if len(attempts) >= MAX_FAILED_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Please wait 60 seconds before trying again.",
            headers={"Retry-After": "60"},
        )


def record_failed_login(client_ip: str) -> None:
    store = _get_attempts_store()
    attempts = store.get(client_ip, [])
    attempts.append(time.time())
    store[client_ip] = attempts
    _save_attempts_store(store)


def clear_failed_logins(client_ip: str) -> None:
    store = _get_attempts_store()
    if client_ip in store:
        del store[client_ip]
        _save_attempts_store(store)


@router.post("/login", response_model=Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    client_ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "unknown")).split(",")[0].strip()
    check_login_rate_limit(client_ip)

    user = db.scalar(select(User).where(User.username == form_data.username))

    if user is None or not verify_password(form_data.password, user.password_hash):
        record_failed_login(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        record_failed_login(client_ip)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is disabled"
        )

    clear_failed_logins(client_ip)
    token = create_access_token(subject=str(user.id), role=user.role.value)
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user
