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
        validate_default=True,
    )

    database_url: str = ""
    secret_key: str = ""
    access_token_expire_minutes: int = 60

    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    cors_origins: list[str] = ["http://localhost:5173"]

    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_prefix: str = "messenger"
    s3_presigned_url_expires_seconds: int = 3600
    avatar_image_max_bytes: int = 5 * 1024 * 1024
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

    @field_validator("database_url", mode="after")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not value:
            raise ValueError("DATABASE_URL is required")
        return value

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
        if not self.s3_bucket.strip():
            raise ValueError("S3_BUCKET is required")
        if not self.s3_region.strip():
            raise ValueError("S3_REGION is required")
        if not 1 <= self.s3_presigned_url_expires_seconds <= 604800:
            raise ValueError(
                "S3_PRESIGNED_URL_EXPIRES_SECONDS must be between 1 and 604800"
            )
        return self


settings = Settings()
