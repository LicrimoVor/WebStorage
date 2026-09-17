from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    actor: str
    action: str
    entity: str
    entity_id: str | None
    request_id: str | None
    method: str | None
    status_code: int | None
    before: dict[str, Any] | None
    after: dict[str, Any] | None


class AuditEventList(BaseModel):
    through_id: int
    items: list[AuditEventRead]
    page: int
    page_size: int
    total: int
    pages: int
