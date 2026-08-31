from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.security import Role


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def clean_username(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class AuthSessionRead(BaseModel):
    username: str
    roles: list[Role]
    expires_at: datetime | None = None
