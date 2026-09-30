import uuid
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.errors import DomainValidationError
from app.core.types import Money


class FundingPart(BaseModel):
    funding_source_id: uuid.UUID
    amount: Money = Field(ge=0)


class FundingWrite(BaseModel):
    funding_allocations: list[FundingPart] = Field(default_factory=list, max_length=100)


class FundingMixin:
    funding_allocations: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default="[]"
    )


async def validate_allocations(
    session: AsyncSession,
    payload: Any,
    total: Decimal | None,
) -> list[dict[str, Any]]:
    from app.modules.business.service import validate_funding

    await validate_funding(session, payload.funding_source_id)
    parts = payload.funding_allocations
    if not parts:
        return []
    ids = [part.funding_source_id for part in parts]
    if len(ids) != len(set(ids)) or payload.funding_source_id not in ids:
        raise DomainValidationError("Выберите разные источники, включая основной")
    if total is None or sum((part.amount for part in parts), Decimal(0)) != total:
        raise DomainValidationError("Сумма по источникам должна совпадать с общей суммой")  # noqa: RUF001
    for part in parts:
        await validate_funding(session, part.funding_source_id)
    return [part.model_dump(mode="json") for part in parts]
