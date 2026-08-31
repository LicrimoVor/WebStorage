from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "WebStorage"
    environment: str = "development"
    database_url: str = "postgresql+asyncpg://webstorage:webstorage@localhost:5432/webstorage"
    cors_origins: list[str] = ["http://localhost:5173"]
    public_app_url: str = "http://localhost:5173"
    auth_disabled: bool = False
    session_cookie_secure: bool = False
    session_ttl_hours: int = 12
    media_root: Path = Path(__file__).resolve().parents[2] / "media"

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        if self.environment == "production" and self.auth_disabled:
            raise ValueError("AUTH_DISABLED must be false in production")
        if self.environment == "production" and not self.session_cookie_secure:
            raise ValueError("SESSION_COOKIE_SECURE must be true in production")
        if not 1 <= self.session_ttl_hours <= 24:
            raise ValueError("SESSION_TTL_HOURS must be between 1 and 24")
        return self

    @property
    def session_cookie_name(self) -> str:
        return "__Host-webstorage_session" if self.session_cookie_secure else "webstorage_session"


@lru_cache
def get_settings() -> Settings:
    return Settings()
