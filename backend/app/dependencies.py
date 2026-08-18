import secrets
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from typing import Any

import jwt
from fastapi import Cookie, HTTPException, Response, status
from pwdlib import PasswordHash

from app.db import SessionDep
from app.models import User
from app.redis import redis_client
from app.settings import settings

ALGORITHM = "HS256"
SESSION_KEY_PREFIX = "session:"

password_hash = PasswordHash.recommended()


async def create_user_session(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    jti = secrets.token_urlsafe(32)

    token = create_token(
        {
            "sub": str(user_id),
            "jti": jti,
            "iat": int(now.timestamp()),
        }
    )

    await redis_client.set(
        session_key(jti),
        str(user_id),
        ex=settings.session_timeout_seconds,
    )

    return token


def create_token(data: dict) -> str:
    return jwt.encode(data, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.secret_key,
        algorithms=[ALGORITHM],
        options={"require": ["sub", "jti", "iat"]},
    )


def session_key(jti: str) -> str:
    return f"{SESSION_KEY_PREFIX}{jti}"


async def validate_user_session(jti: str, user_id: int) -> bool:
    redis_session_user_id = await redis_client.getex(
        session_key(jti),
        ex=settings.session_timeout_seconds,
    )
    return redis_session_user_id == str(user_id)


async def revoke_user_session(token: str) -> None:
    payload = decode_token(token)
    await redis_client.delete(session_key(str(payload["jti"])))


async def get_current_user(
    session: SessionDep, response: Response, token: str | None = Cookie(default=None)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    if token is None:
        raise credentials_exception

    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
        jti = str(payload["jti"])
    except Exception:
        raise credentials_exception

    if not await validate_user_session(jti, user_id):
        # Logged out, revoked, or timed out.
        raise credentials_exception

    # Refresh the browser cookie's idle timeout too.
    response.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.session_timeout_seconds,
    )

    user = session.get(User, user_id)
    if user is None:
        raise credentials_exception

    return user


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return password_hash.hash(password)


def get_cookie_from_environ(environ: dict, key: str) -> str | None:
    cookie_header = environ.get("HTTP_COOKIE")

    if not cookie_header:
        scope = environ.get("asgi.scope", {})
        headers = scope.get("headers", [])
        for name, value in headers:
            if name == b"cookie":
                cookie_header = value.decode()
                break

    if not cookie_header:
        return None

    cookie = SimpleCookie()
    cookie.load(cookie_header)

    if key not in cookie:
        return None

    return cookie[key].value
