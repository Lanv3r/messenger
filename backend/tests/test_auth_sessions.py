import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-at-least-32-bytes")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://unused:unused@localhost/unused",
)
os.environ.setdefault("S3_BUCKET", "messenger-test-uploads")

from app import dependencies  # noqa: E402
from app import socket_handlers  # noqa: E402


class InMemoryRedisClient:
    def __init__(self):
        self.values: dict[str, str] = {}
        self.last_timeout: int | None = None

    async def set(self, name: str, value: str, **kwargs):
        self.values[name] = value
        self.last_timeout = kwargs.get("ex")
        return True

    async def getex(self, name: str, **kwargs):
        self.last_timeout = kwargs.get("ex")
        return self.values.get(name)

    async def delete(self, name: str):
        return 1 if self.values.pop(name, None) is not None else 0


class RedisSessionTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.redis = InMemoryRedisClient()
        self.redis_patch = patch.object(dependencies, "redis_client", self.redis)
        self.redis_patch.start()

    async def asyncTearDown(self):
        self.redis_patch.stop()

    async def test_session_creation_validation_refresh_and_revocation(self):
        token = await dependencies.create_user_session(42)
        payload = dependencies.decode_token(token)
        jti = str(payload["jti"])
        key = dependencies.session_key(jti)

        self.assertEqual(self.redis.values[key], "42")
        self.assertTrue(await dependencies.validate_user_session(jti, 42))
        self.assertEqual(
            self.redis.last_timeout,
            dependencies.settings.session_timeout_seconds,
        )

        await dependencies.revoke_user_session(token)

        self.assertFalse(await dependencies.validate_user_session(jti, 42))

    async def test_session_rejects_a_different_user(self):
        token = await dependencies.create_user_session(42)
        jti = str(dependencies.decode_token(token)["jti"])

        self.assertFalse(await dependencies.validate_user_session(jti, 99))

    async def test_socket_helper_uses_the_shared_session_validator(self):
        token = await dependencies.create_user_session(42)
        jti = str(dependencies.decode_token(token)["jti"])
        socket_session = {"user_id": 42, "jti": jti}

        with (
            patch.object(
                socket_handlers.sio,
                "get_session",
                AsyncMock(return_value=socket_session),
            ),
            patch.object(
                socket_handlers.sio,
                "disconnect",
                AsyncMock(),
            ) as disconnect,
        ):
            result = await socket_handlers.get_authenticated_socket_session("sid")
            self.assertEqual(result, socket_session)

            await dependencies.revoke_user_session(token)
            result = await socket_handlers.get_authenticated_socket_session("sid")

        self.assertIsNone(result)
        disconnect.assert_awaited_once_with("sid")


if __name__ == "__main__":
    unittest.main()
