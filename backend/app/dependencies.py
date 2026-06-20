import os
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from typing import Any

import jwt
from fastapi import Cookie, HTTPException, status
from pwdlib import PasswordHash

from app.db import SessionDep
from app.models import User

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY is not set")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

password_hash = PasswordHash.recommended()


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(access_token: str) -> dict[str, Any]:
    return jwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM])


async def get_current_user(
    session: SessionDep,
    access_token: str | None = Cookie(default=None),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    if access_token is None:
        raise credentials_exception

    try:
        payload = decode_access_token(access_token)
        user_id = int(payload["sub"])
    except Exception:
        raise credentials_exception

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
