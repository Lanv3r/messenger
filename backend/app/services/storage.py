from pathlib import PurePosixPath
from functools import lru_cache

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from app.settings import settings

UPLOAD_CATEGORIES = {"avatars", "files", "voice"}


def build_storage_key(category: str, filename: str) -> str:
    if category not in UPLOAD_CATEGORIES:
        raise ValueError(f"Unsupported upload category: {category}")
    if not filename or "/" in filename or "\\" in filename:
        raise ValueError("Upload filename is invalid")
    return f"{category}/{filename}"


def _validate_storage_key(storage_key: str) -> PurePosixPath:
    path = PurePosixPath(storage_key)
    if (
        path.is_absolute()
        or len(path.parts) != 2
        or path.parts[0] not in UPLOAD_CATEGORIES
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise HTTPException(status_code=404, detail="Uploaded file not found")
    return path


def _s3_object_key(storage_key: str) -> str:
    prefix = settings.s3_prefix.strip("/")
    return f"{prefix}/{storage_key}" if prefix else storage_key


@lru_cache
def _get_s3_client():
    return boto3.client("s3", region_name=settings.s3_region)


def _storage_unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="Upload storage is unavailable")


async def store_upload(
    category: str,
    filename: str,
    content: bytes,
    content_type: str,
) -> str:
    storage_key = build_storage_key(category, filename)

    try:
        await run_in_threadpool(
            _get_s3_client().put_object,
            Bucket=settings.s3_bucket,
            Key=_s3_object_key(storage_key),
            Body=content,
            ContentType=content_type,
        )
    except (BotoCoreError, ClientError) as error:
        raise _storage_unavailable() from error

    return storage_key


def get_upload_url(storage_key: str) -> str:
    _validate_storage_key(storage_key)

    try:
        return _get_s3_client().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.s3_bucket,
                "Key": _s3_object_key(storage_key),
            },
            ExpiresIn=settings.s3_presigned_url_expires_seconds,
        )
    except (BotoCoreError, ClientError) as error:
        raise _storage_unavailable() from error


def _read_s3_upload(storage_key: str) -> bytes:
    response = _get_s3_client().get_object(
        Bucket=settings.s3_bucket,
        Key=_s3_object_key(storage_key),
    )
    body = response["Body"]
    try:
        return body.read()
    finally:
        body.close()


async def read_upload(storage_key: str) -> bytes:
    _validate_storage_key(storage_key)

    try:
        return await run_in_threadpool(_read_s3_upload, storage_key)
    except ClientError as error:
        error_code = error.response.get("Error", {}).get("Code")
        if error_code in {"404", "NoSuchKey", "NotFound"}:
            raise HTTPException(status_code=404, detail="Uploaded file not found") from error
        raise _storage_unavailable() from error
    except BotoCoreError as error:
        raise _storage_unavailable() from error
