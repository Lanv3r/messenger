from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.upload_constants import (
    AVATAR_IMAGE_ALLOWED_TYPES,
    AVATAR_IMAGE_MAX_BYTES,
    AVATAR_UPLOAD_URL_PREFIX,
    AVATAR_UPLOADS_DIR,
)


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

    AVATAR_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    upload_path = AVATAR_UPLOADS_DIR / filename
    upload_path.write_bytes(image_bytes)

    return f"{AVATAR_UPLOAD_URL_PREFIX}/{filename}"
