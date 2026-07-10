from collections import deque
from time import monotonic

from fastapi import HTTPException, Request

from app.settings import settings


class FixedWindowRateLimiter:
    def __init__(self, name: str, limit: int, window_seconds: int = 60):
        self.name = name
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = {}

    def reset(self) -> None:
        self._hits.clear()

    def hit_key(self, key: str) -> None:
        if self.limit <= 0:
            return

        now = monotonic()
        bucket = self._hits.setdefault(key, deque())
        cutoff = now - self.window_seconds

        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

        if len(bucket) >= self.limit:
            raise HTTPException(status_code=429, detail="Too many requests")

        bucket.append(now)

    async def __call__(self, request: Request) -> None:
        client_host = request.client.host if request.client else "unknown"
        self.hit_key(f"{self.name}:{client_host}")


login_rate_limiter = FixedWindowRateLimiter(
    "login",
    settings.login_rate_limit_per_minute,
)
signup_rate_limiter = FixedWindowRateLimiter(
    "signup",
    settings.signup_rate_limit_per_minute,
)
message_rate_limiter = FixedWindowRateLimiter(
    "message",
    settings.message_rate_limit_per_minute,
)
upload_rate_limiter = FixedWindowRateLimiter(
    "upload",
    settings.upload_rate_limit_per_minute,
)


def reset_all_rate_limiters() -> None:
    login_rate_limiter.reset()
    signup_rate_limiter.reset()
    message_rate_limiter.reset()
    upload_rate_limiter.reset()
