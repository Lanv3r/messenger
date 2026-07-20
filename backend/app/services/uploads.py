from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.upload_constants import (
    AVATAR_IMAGE_ALLOWED_TYPES,
    AVATAR_IMAGE_MAX_BYTES,
)
from app.services.storage import get_upload_url, store_upload


async def save_avatar_upload(file: UploadFile | None) -> str | None:
    if file is None or not file.filename:
        return None

    content_type = file.content_type or ""
    base_content_type = content_type.split(";", 1)[0].strip().lower()
    extension = AVATAR_IMAGE_ALLOWED_TYPES.get(base_content_type)
    if extension is None:
        raise HTTPException(
            status_code=400,
            detail="Avatar must be a PNG, JPEG, WebP, or GIF image.",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Avatar file is empty.")
    if len(image_bytes) > AVATAR_IMAGE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Avatar file is too large.")

    filename = f"{uuid4().hex}{extension}"
    return await store_upload("avatars", filename, image_bytes, base_content_type)


def get_avatar_upload_url(storage_key: str | None) -> str:
    return get_upload_url(storage_key) if storage_key else "/favicon.svg"
