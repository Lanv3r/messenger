import asyncio
from io import BytesIO
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from botocore.exceptions import ClientError

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-at-least-32-bytes")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://unused:unused@localhost/unused",
)
os.environ.setdefault("S3_BUCKET", "messenger-test-uploads")
os.environ.setdefault("S3_REGION", "us-east-1")

from app.services import storage  # noqa: E402


class FakeS3Client:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}
        self.put_requests: list[dict] = []
        self.presigned_requests: list[dict] = []

    def put_object(self, **kwargs):
        self.put_requests.append(kwargs)
        self.objects[(kwargs["Bucket"], kwargs["Key"])] = kwargs["Body"]

    def get_object(self, **kwargs):
        content = self.objects.get((kwargs["Bucket"], kwargs["Key"]))
        if content is None:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return {"Body": BytesIO(content)}

    def generate_presigned_url(self, client_method, **kwargs):
        self.presigned_requests.append(
            {"client_method": client_method, **kwargs},
        )
        return "https://example.test/signed-upload"


class UploadStorageTest(unittest.TestCase):
    def test_s3_storage_keeps_a_stable_key_and_signs_downloads(self):
        fake_s3 = FakeS3Client()
        with (
            patch.object(storage.settings, "s3_bucket", "my-messenger-dev-uploads"),
            patch.object(storage.settings, "s3_region", "us-east-1"),
            patch.object(storage.settings, "s3_prefix", "messenger"),
            patch.object(storage.settings, "s3_presigned_url_expires_seconds", 600),
            patch("app.services.storage._get_s3_client", return_value=fake_s3),
        ):
            storage_key = asyncio.run(
                storage.store_upload(
                    "voice",
                    "note.webm",
                    b"audio",
                    "audio/webm",
                ),
            )
            signed_url = storage.get_upload_url(storage_key)
            stored_content = asyncio.run(storage.read_upload(storage_key))

        self.assertEqual(storage_key, "voice/note.webm")
        self.assertEqual(signed_url, "https://example.test/signed-upload")
        self.assertEqual(stored_content, b"audio")
        self.assertEqual(
            fake_s3.put_requests,
            [
                {
                    "Bucket": "my-messenger-dev-uploads",
                    "Key": "messenger/voice/note.webm",
                    "Body": b"audio",
                    "ContentType": "audio/webm",
                },
            ],
        )
        self.assertEqual(
            fake_s3.presigned_requests,
            [
                {
                    "client_method": "get_object",
                    "Params": {
                        "Bucket": "my-messenger-dev-uploads",
                        "Key": "messenger/voice/note.webm",
                    },
                    "ExpiresIn": 600,
                },
            ],
        )

    def test_s3_storage_supports_avatar_keys(self):
        fake_s3 = FakeS3Client()
        with (
            patch.object(storage.settings, "s3_bucket", "my-messenger-dev-uploads"),
            patch.object(storage.settings, "s3_prefix", "messenger"),
            patch("app.services.storage._get_s3_client", return_value=fake_s3),
        ):
            storage_key = asyncio.run(
                storage.store_upload(
                    "avatars",
                    "profile.png",
                    b"image",
                    "image/png",
                ),
            )

        self.assertEqual(storage_key, "avatars/profile.png")
        self.assertEqual(
            fake_s3.objects[("my-messenger-dev-uploads", "messenger/avatars/profile.png")],
            b"image",
        )
