import math
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainValidationError
from app.core.query import SortOrder
from app.modules.finance import repository
from app.modules.finance.model import FinancialTransaction
from app.modules.finance.schemas import (
    FinanceEntryList,
    FinanceEntryRead,
    FinanceSource,
    FinanceSummary,
    FinancialDirection,
    FinancialTransactionCreate,
    FinancialTransactionRead,
)

MONEY_STEP = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


def timestamp(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(UTC)
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def validate_period(date_from: datetime | None, date_to: datetime | None) -> None:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise DomainValidationError("date_from must not be after date_to")


def period_timestamp(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


def to_transaction_read(transaction: FinancialTransaction) -> FinancialTransactionRead:
    return FinancialTransactionRead(
        id=transaction.id,
        transaction_type=FinancialDirection(transaction.transaction_type),
        amount=transaction.amount,
        occurred_at=transaction.occurred_at,
        category=transaction.category,
        comment=transaction.comment,
        created_by=transaction.created_by,
        created_at=transaction.created_at,
    )


async def create_manual_transaction(
    session: AsyncSession,
    *,
    payload: FinancialTransactionCreate,
    created_by: str,
) -> FinancialTransactionRead:
    transaction = FinancialTransaction(
        transaction_type=payload.transaction_type.value,
        amount=money(payload.amount),
        occurred_at=timestamp(payload.occurred_at),
        category=payload.category,
        comment=payload.comment,
        created_by=created_by,
    )
    await repository.create_transaction(session, transaction)
    await session.commit()
    await session.refresh(transaction)
    return to_transaction_read(transaction)


async def list_entries(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    source: FinanceSource,
    direction: FinancialDirection | None,
    date_from: datetime | None,
    date_to: datetime | None,
    sort_order: SortOrder,
) -> FinanceEntryList:
    date_from = period_timestamp(date_from)
    date_to = period_timestamp(date_to)
    validate_period(date_from, date_to)
    rows, total = await repository.list_entries(
        session,
        page=page,
        page_size=page_size,
        source=source,
        direction=direction,
        date_from=date_from,
        date_to=date_to,
        sort_order=sort_order,
    )
    return FinanceEntryList(
        items=[
            FinanceEntryRead(
                id=row.id,
                source_id=row.source_id,
                source_type=FinanceSource(row.source_type),
                direction=FinancialDirection(row.direction),
                category=row.category,
                description=row.description,
                amount=Decimal(row.amount),
                occurred_at=row.occurred_at,
                comment=row.comment,
                created_by=row.created_by,
            )
            for row in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def get_summary(
    session: AsyncSession,
    *,
    date_from: datetime | None,
    date_to: datetime | None,
) -> FinanceSummary:
    date_from = period_timestamp(date_from)
    date_to = period_timestamp(date_to)
    validate_period(date_from, date_to)
    sales, materials, labour, manual_income, manual_expense, incomplete = (
        await repository.summary_values(
            session, date_from=date_from, date_to=date_to
        )
    )
    total_income = money(sales + manual_income)
    total_expense = money(materials + labour + manual_expense)
    return FinanceSummary(
        total_income=total_income,
        total_expense=total_expense,
        balance=money(total_income - total_expense),
        sales_income=money(sales),
        material_expense=money(materials),
        labour_expense=money(labour),
        manual_income=money(manual_income),
        manual_expense=money(manual_expense),
        incomplete_material_movements=incomplete,
    )
