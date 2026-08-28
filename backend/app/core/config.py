from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "WebStorage"
    environment: str = "development"
    database_url: str = "postgresql+asyncpg://webstorage:webstorage@localhost:5432/webstorage"
    cors_origins: list[str] = ["http://localhost:5173"]
    auth_disabled: bool = True
    development_token: SecretStr = SecretStr("change-me-outside-local-development")
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
        if (
            not self.auth_disabled
            and self.development_token.get_secret_value() == "change-me-outside-local-development"
        ):
            raise ValueError("DEVELOPMENT_TOKEN must be changed when authentication is enabled")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
