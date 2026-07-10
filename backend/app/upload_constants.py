from app.settings import settings


UPLOADS_DIR = settings.uploads_dir
VOICE_UPLOADS_DIR = UPLOADS_DIR / "voice"
FILE_UPLOADS_DIR = UPLOADS_DIR / "files"
VOICE_UPLOAD_URL_PREFIX = settings.voice_upload_url_prefix
FILE_UPLOAD_URL_PREFIX = settings.file_upload_url_prefix
VOICE_MESSAGE_MAX_BYTES = settings.voice_message_max_bytes
FILE_MESSAGE_MAX_BYTES = settings.file_message_max_bytes
VOICE_MESSAGE_ALLOWED_TYPES = {
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/x-wav": ".wav",
}
FILE_MESSAGE_ALLOWED_TYPES = {
    "application/msword": ".doc",
    "application/octet-stream": ".bin",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/zip": ".zip",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/x-wav": ".wav",
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "text/csv": ".csv",
    "text/plain": ".txt",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
}
