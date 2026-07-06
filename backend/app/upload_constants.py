from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BACKEND_DIR / "uploads"
VOICE_UPLOADS_DIR = UPLOADS_DIR / "voice"
VOICE_UPLOAD_URL_PREFIX = "/uploads/voice"
VOICE_MESSAGE_MAX_BYTES = 10 * 1024 * 1024
VOICE_MESSAGE_ALLOWED_TYPES = {
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/x-wav": ".wav",
}
