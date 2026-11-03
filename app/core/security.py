from datetime import datetime, timedelta, timezone

try:
    import jwt as _pyjwt  # PyJWT (preferred, actively maintained)

    def _encode(payload, key, algorithm):
        return _pyjwt.encode(payload, key, algorithm=algorithm)

    def _decode(token, key, algorithms):
        return _pyjwt.decode(token, key, algorithms=algorithms)

    _JWTError = _pyjwt.PyJWTError
except ImportError:
    from jose import jwt as _jose_jwt, JWTError  # legacy fallback

    def _encode(payload, key, algorithm):
        return _jose_jwt.encode(payload, key, algorithm=algorithm)

    def _decode(token, key, algorithms):
        return _jose_jwt.decode(token, key, algorithms=algorithms)

    _JWTError = JWTError

from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(subject: str, role: str) -> str:
    """subject is the user id (as str); role is embedded so we don't need a
    DB hit on every request just to check permissions."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": subject, "role": role, "exp": expire}
    return _encode(payload, settings.SECRET_KEY, settings.ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return _decode(token, settings.SECRET_KEY, [settings.ALGORITHM])
    except _JWTError:
        return None
