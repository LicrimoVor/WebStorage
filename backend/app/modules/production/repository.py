import uuid

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.production.model import ProductionRecord


async def create_record(
    session: AsyncSession, record: ProductionRecord
) -> ProductionRecord:
    session.add(record)
    await session.flush()
    return record


async def get_by_idempotency_key(
    session: AsyncSession, idempotency_key: str
) -> ProductionRecord | None:
    return (
        await session.execute(
            select(ProductionRecord).where(
                ProductionRecord.idempotency_key == idempotency_key
            )
        )
    ).scalar_one_or_none()


async def get_record(
    session: AsyncSession, record_id: uuid.UUID
) -> ProductionRecord | None:
    return await session.get(ProductionRecord, record_id)


async def list_records(
    session: AsyncSession,
    *,
    plan_id: uuid.UUID,
    page: int,
    page_size: int,
) -> tuple[list[ProductionRecord], int]:
    base = select(ProductionRecord).where(
        ProductionRecord.production_plan_id == plan_id
    )
    total = int(
        (
            await session.execute(
                select(func.count()).select_from(base.order_by(None).subquery())
            )
        ).scalar_one()
    )
    records = list(
        (
            await session.execute(
                base.order_by(
                    desc(ProductionRecord.created_at), desc(ProductionRecord.id)
                )
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )
    return records, total
