import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class InstructionStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class InstructionDraftSave(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    content: str = Field(max_length=1_000_000)
    expected_revision: int | None = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        result = value.strip()
        if not result:
            raise ValueError("must not be blank")
        return result


class InstructionVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_number: int
    revision: int
    status: InstructionStatus
    title: str
    content: str
    rendered_html: str
    created_by: str
    published_by: str | None
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime


class InstructionVersionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_number: int
    revision: int
    status: InstructionStatus
    title: str
    created_by: str
    published_by: str | None
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime


class InstructionRead(BaseModel):
    operation_id: uuid.UUID
    operation_name: str
    status: str
    draft: InstructionVersionRead | None
    published: InstructionVersionRead | None
    versions: list[InstructionVersionSummary]


class InstructionAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    filename: str
    content_type: str
    size: int
    created_at: datetime


class PublicLinkCreate(BaseModel):
    expires_at: datetime | None = None
    revoke_existing: bool = False


class PublicLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    active: bool
    public_url: str | None = None
    qr_url: str | None = None


class PublicInstructionRead(BaseModel):
    operation_id: uuid.UUID
    operation_name: str
    title: str
    content: str
    rendered_html: str
    version_number: int
    published_at: datetime
