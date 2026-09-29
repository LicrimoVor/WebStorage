from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    app_name: str = "WebStorage"
    environment: str = "development"
    database_url: str = "postgresql+asyncpg://webstorage:webstorage@localhost:5432/webstorage"
    postgres_db: str | None = None
    postgres_user: str | None = None
    postgres_password: str | None = Field(default=None, repr=False)
    cors_origins: list[str] = ["http://localhost:5173"]
    public_app_url: str = "http://localhost:5173"
    auth_disabled: bool = False
    session_cookie_secure: bool = False
    access_token_ttl_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_ttl_days: int = Field(default=30, ge=1, le=90)
    media_root: Path = Path(__file__).resolve().parents[2] / "media"

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        if "database_url" not in self.model_fields_set and self.postgres_db is not None:
            if self.postgres_user is None or self.postgres_password is None:
                raise ValueError(
                    "POSTGRES_USER and POSTGRES_PASSWORD are required with POSTGRES_DB"
                )
            self.database_url = URL.create(
                "postgresql+asyncpg",
                username=self.postgres_user,
                password=self.postgres_password,
                host="database",
                port=5432,
                database=self.postgres_db,
            ).render_as_string(hide_password=False)
        if self.environment == "production" and self.auth_disabled:
            raise ValueError("AUTH_DISABLED must be false in production")
        return self

    @property
    def session_cookie_name(self) -> str:
        return "__Host-webstorage_session" if self.session_cookie_secure else "webstorage_session"


@lru_cache
def get_settings() -> Settings:
    return Settings()
