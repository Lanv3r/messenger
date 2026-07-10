import json
from pathlib import Path
from typing import Any, Literal, cast

from dotenv import load_dotenv
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BACKEND_DIR / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        extra="ignore",
        enable_decoding=False,
    )

    database_url: str
    secret_key: str
    access_token_expire_minutes: int = 60

    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    cors_origins: list[str] = ["http://localhost:5173"]

    uploads_dir: Path = BACKEND_DIR / "uploads"
    voice_upload_url_prefix: str = "/uploads/voice"
    file_upload_url_prefix: str = "/uploads/files"
    voice_message_max_bytes: int = 10 * 1024 * 1024
    file_message_max_bytes: int = 25 * 1024 * 1024

    login_rate_limit_per_minute: int = 100
    signup_rate_limit_per_minute: int = 200
    message_rate_limit_per_minute: int = 300
    upload_rate_limit_per_minute: int = 100

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str] | Any:
        if isinstance(value, str):
            stripped_value = value.strip()
            if stripped_value.startswith("["):
                parsed_value = json.loads(stripped_value)
                if isinstance(parsed_value, list):
                    return [
                        str(origin).strip()
                        for origin in parsed_value
                        if str(origin).strip()
                    ]
            return [
                origin.strip()
                for origin in stripped_value.split(",")
                if origin.strip()
            ]
        return value

    @field_validator("uploads_dir", mode="after")
    @classmethod
    def resolve_uploads_dir(cls, value: Path) -> Path:
        return value if value.is_absolute() else BACKEND_DIR / value

    @field_validator("cookie_samesite", mode="before")
    @classmethod
    def normalize_cookie_samesite(
        cls,
        value: Any,
    ) -> Literal["lax", "strict", "none"]:
        normalized_value = str(value).lower()
        if normalized_value not in {"lax", "strict", "none"}:
            raise ValueError("COOKIE_SAMESITE must be lax, strict, or none")
        return cast(Literal["lax", "strict", "none"], normalized_value)

    @field_validator("secret_key", mode="after")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return value

    @model_validator(mode="after")
    def validate_cookie_security(self):
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true when COOKIE_SAMESITE is none")
        return self


settings = Settings()
