import hashlib
import json
import math
import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.core.query import SortOrder
from app.modules.inventory.types import MovementType
from app.modules.manufactured_items import movement_repository
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.sales import repository
from app.modules.sales.model import Sale
from app.modules.sales.schemas import (
    SaleCreate,
    SaleList,
    SaleRead,
    SaleSortField,
    SaleSummary,
)

QUANTITY_STEP = Decimal("0.000001")
MONEY_STEP = Decimal("0.01")


def quantity(value: Decimal) -> Decimal:
    return value.quantize(QUANTITY_STEP, rounding=ROUND_HALF_UP)


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


def timestamp(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(UTC)
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def request_fingerprint(payload: SaleCreate) -> str:
    document = {
        "product_id": str(payload.product_id),
        "quantity": format(quantity(payload.quantity), "f"),
        "unit_price": format(money(payload.unit_price), "f"),
        "sold_at": timestamp(payload.sold_at).isoformat() if payload.sold_at else None,
        "comment": payload.comment,
    }
    encoded = json.dumps(document, ensure_ascii=False, sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()


def to_read_model(row: repository.SaleRow) -> SaleRead:
    sale, product, movement = row
    return SaleRead(
        id=sale.id,
        product_id=product.id,
        product_name=product.name,
        product_unit=product.unit,
        quantity=sale.quantity,
        unit_price=sale.unit_price,
        total_amount=sale.total_amount,
        sold_at=sale.sold_at,
        comment=sale.comment,
        inventory_movement_id=movement.id,
        balance_after=movement.balance_after,
        idempotency_key=sale.idempotency_key,
        created_by=sale.created_by,
        created_at=sale.created_at,
    )


async def _read(session: AsyncSession, sale_id: uuid.UUID) -> SaleRead:
    row = await repository.get_sale_row(session, sale_id)
    if row is None:
        raise NotFoundError("Sale was not found")
    return to_read_model(row)


async def _execute(
    session: AsyncSession,
    *,
    payload: SaleCreate,
    idempotency_key: str,
    fingerprint: str,
    created_by: str,
) -> SaleRead:
    product = (
        await session.execute(
            select(ManufacturedItem)
            .where(ManufacturedItem.id == payload.product_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if product is None:
        raise NotFoundError("Product was not found")
    if not product.is_product:
        raise DomainValidationError("Only products can be sold")
    if product.archived:
        raise ConflictError("An archived product cannot be sold")
    sale_quantity = quantity(payload.quantity)
    unit_price = money(payload.unit_price)
    sale = Sale(
        product_id=product.id,
        quantity=sale_quantity,
        unit_price=unit_price,
        total_amount=money(sale_quantity * unit_price),
        sold_at=timestamp(payload.sold_at),
        comment=payload.comment,
        idempotency_key=idempotency_key,
        request_fingerprint=fingerprint,
        created_by=created_by,
    )
    await repository.create_sale(session, sale)
    await movement_repository.create_movement(
        session,
        item_id=product.id,
        movement_type=MovementType.SALE,
        quantity=-sale_quantity,
        comment=payload.comment or f"Sale of {product.name}",
        source_type="sale",
        source_id=sale.id,
        sale_id=sale.id,
    )
    await session.commit()
    return await _read(session, sale.id)


async def register(
    session: AsyncSession,
    *,
    payload: SaleCreate,
    idempotency_key: str,
    created_by: str,
) -> SaleRead:
    fingerprint = request_fingerprint(payload)
    existing = await repository.get_by_idempotency_key(session, idempotency_key)
    if existing is not None:
        if existing.request_fingerprint != fingerprint:
            raise ConflictError("Idempotency key was already used for another request")
        return await _read(session, existing.id)
    try:
        return await _execute(
            session,
            payload=payload,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint,
            created_by=created_by,
        )
    except IntegrityError as error:
        await session.rollback()
        existing = await repository.get_by_idempotency_key(session, idempotency_key)
        if existing is None:
            raise ConflictError("Sale registration conflicted") from error
        if existing.request_fingerprint != fingerprint:
            raise ConflictError(
                "Idempotency key was already used for another request"
            ) from error
        return await _read(session, existing.id)


def validate_period(date_from: datetime | None, date_to: datetime | None) -> None:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise DomainValidationError("date_from must not be after date_to")


def period_timestamp(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


async def list_all(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    product_id: uuid.UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
    sort_by: SaleSortField,
    sort_order: SortOrder,
) -> SaleList:
    date_from = period_timestamp(date_from)
    date_to = period_timestamp(date_to)
    validate_period(date_from, date_to)
    rows, total, filtered_quantity, filtered_amount = await repository.list_sales(
        session,
        page=page,
        page_size=page_size,
        product_id=product_id,
        date_from=date_from,
        date_to=date_to,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return SaleList(
        items=[to_read_model(row) for row in rows],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
        filtered_quantity=filtered_quantity,
        filtered_amount=filtered_amount,
    )


async def get_summary(
    session: AsyncSession,
    *,
    product_id: uuid.UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> SaleSummary:
    date_from = period_timestamp(date_from)
    date_to = period_timestamp(date_to)
    validate_period(date_from, date_to)
    count, total_quantity, total_amount = await repository.summary(
        session,
        product_id=product_id,
        date_from=date_from,
        date_to=date_to,
    )
    average = money(total_amount / total_quantity) if total_quantity else Decimal("0")
    return SaleSummary(
        sales_count=count,
        total_quantity=total_quantity,
        total_amount=total_amount,
        average_unit_price=average,
    )
