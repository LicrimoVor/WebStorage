import uuid
from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.selectable import Subquery

from app.modules.employees.model import Employee
from app.modules.operations.model import Operation
from app.modules.payroll.model import EmployeePayment, PaymentAllocation, WorkEntry


def allocation_totals_subquery() -> Subquery:
    return (
        select(
            PaymentAllocation.work_entry_id.label("work_entry_id"),
            func.sum(PaymentAllocation.amount).label("paid_amount"),
        )
        .group_by(PaymentAllocation.work_entry_id)
        .subquery()
    )


async def get_work_entry(
    session: AsyncSession, work_entry_id: uuid.UUID, *, for_update: bool = False
) -> WorkEntry | None:
    statement = select(WorkEntry).where(WorkEntry.id == work_entry_id)
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def work_entry_details(
    session: AsyncSession, work_entry_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, tuple[str, str, Decimal]]:
    if not work_entry_ids:
        return {}
    totals = allocation_totals_subquery()
    rows = (
        await session.execute(
            select(
                WorkEntry.id,
                func.coalesce(Employee.full_name, "Анонимно"),
                Operation.name,
                func.coalesce(totals.c.paid_amount, Decimal("0")),
            )
            .outerjoin(Employee, Employee.id == WorkEntry.employee_id)
            .join(Operation, Operation.id == WorkEntry.operation_id)
            .outerjoin(totals, totals.c.work_entry_id == WorkEntry.id)
            .where(WorkEntry.id.in_(work_entry_ids))
        )
    ).all()
    return {
        row[0]: (row[1], row[2], Decimal(row[3]))
        for row in rows
    }


async def list_work_entries(
    session: AsyncSession,
    *,
    operation_id: uuid.UUID | None,
    employee_id: uuid.UUID | None,
    include_voided: bool,
    page: int,
    page_size: int,
) -> tuple[list[WorkEntry], int]:
    statement = select(WorkEntry)
    if operation_id is not None:
        statement = statement.where(WorkEntry.operation_id == operation_id)
    if employee_id is not None:
        statement = statement.where(WorkEntry.employee_id == employee_id)
    if not include_voided:
        statement = statement.where(WorkEntry.voided_at.is_(None))
    total = int(
        (
            await session.execute(
                select(func.count()).select_from(statement.order_by(None).subquery())
            )
        ).scalar_one()
    )
    statement = statement.order_by(
        WorkEntry.performed_at.desc(), WorkEntry.created_at.desc(), WorkEntry.id
    )
    statement = statement.offset((page - 1) * page_size).limit(page_size)
    return list((await session.execute(statement)).scalars().all()), total


async def paid_for_work_entry(session: AsyncSession, work_entry_id: uuid.UUID) -> Decimal:
    value = await session.scalar(
        select(func.coalesce(func.sum(PaymentAllocation.amount), Decimal("0"))).where(
            PaymentAllocation.work_entry_id == work_entry_id
        )
    )
    return Decimal(value or 0)


async def outstanding_entries(
    session: AsyncSession, employee_id: uuid.UUID
) -> list[tuple[WorkEntry, Decimal]]:
    totals = allocation_totals_subquery()
    paid = func.coalesce(totals.c.paid_amount, Decimal("0"))
    rows = (
        await session.execute(
            select(WorkEntry, paid)
            .outerjoin(totals, totals.c.work_entry_id == WorkEntry.id)
            .where(
                WorkEntry.employee_id == employee_id,
                WorkEntry.voided_at.is_(None),
                WorkEntry.accrued_amount.is_not(None),
                WorkEntry.accrued_amount > paid,
            )
            .order_by(WorkEntry.performed_at, WorkEntry.created_at, WorkEntry.id)
            .with_for_update(of=WorkEntry)
        )
    ).all()
    return [(row[0], Decimal(row[1])) for row in rows]


async def list_payments(
    session: AsyncSession,
    *,
    employee_id: uuid.UUID,
    page: int,
    page_size: int,
) -> tuple[list[EmployeePayment], int]:
    statement = select(EmployeePayment).where(EmployeePayment.employee_id == employee_id)
    total = int(
        (
            await session.execute(
                select(func.count()).select_from(statement.order_by(None).subquery())
            )
        ).scalar_one()
    )
    statement = statement.order_by(
        EmployeePayment.paid_at.desc(), EmployeePayment.created_at.desc(), EmployeePayment.id
    )
    statement = statement.offset((page - 1) * page_size).limit(page_size)
    return list((await session.execute(statement)).scalars().all()), total


async def payment_allocations(
    session: AsyncSession, payment_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[tuple[PaymentAllocation, WorkEntry, Operation]]]:
    result: dict[
        uuid.UUID, list[tuple[PaymentAllocation, WorkEntry, Operation]]
    ] = {payment_id: [] for payment_id in payment_ids}
    if not payment_ids:
        return result
    rows = (
        await session.execute(
            select(PaymentAllocation, WorkEntry, Operation)
            .join(WorkEntry, WorkEntry.id == PaymentAllocation.work_entry_id)
            .join(Operation, Operation.id == WorkEntry.operation_id)
            .where(PaymentAllocation.payment_id.in_(payment_ids))
            .order_by(WorkEntry.performed_at, WorkEntry.id)
        )
    ).all()
    for allocation, work_entry, operation in rows:
        result[allocation.payment_id].append((allocation, work_entry, operation))
    return result


async def employee_totals(
    session: AsyncSession, employee_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, tuple[Decimal, Decimal, Decimal, Decimal]]:
    if not employee_ids:
        return {}
    totals = allocation_totals_subquery()
    paid_amount = func.coalesce(totals.c.paid_amount, Decimal("0"))
    paid_equivalent = case(
        (
            WorkEntry.accrued_amount > 0,
            func.coalesce(WorkEntry.equivalent_quantity, Decimal("0"))
            * func.least(paid_amount / WorkEntry.accrued_amount, Decimal("1")),
        ),
        else_=Decimal("0"),
    )
    rows = (
        await session.execute(
            select(
                WorkEntry.employee_id,
                func.coalesce(func.sum(WorkEntry.accrued_amount), Decimal("0")),
                func.coalesce(func.sum(totals.c.paid_amount), Decimal("0")),
                func.coalesce(func.sum(WorkEntry.equivalent_quantity), Decimal("0")),
                func.coalesce(func.sum(paid_equivalent), Decimal("0")),
            )
            .outerjoin(totals, totals.c.work_entry_id == WorkEntry.id)
            .where(
                WorkEntry.employee_id.in_(employee_ids),
                WorkEntry.voided_at.is_(None),
            )
            .group_by(WorkEntry.employee_id)
        )
    ).all()
    return {
        row[0]: (
            Decimal(row[1]),
            Decimal(row[2]),
            Decimal(row[3]),
            Decimal(row[4]),
        )
        for row in rows
    }


async def operation_completed_totals(
    session: AsyncSession, operation_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, Decimal]:
    if not operation_ids:
        return {}
    rows = (
        await session.execute(
            select(
                WorkEntry.operation_id,
                func.coalesce(func.sum(WorkEntry.equivalent_quantity), Decimal("0")),
            )
            .where(
                WorkEntry.operation_id.in_(operation_ids),
                WorkEntry.voided_at.is_(None),
            )
            .group_by(WorkEntry.operation_id)
        )
    ).all()
    return {row[0]: Decimal(row[1]) for row in rows}


async def employee_operation_totals(
    session: AsyncSession, employee_id: uuid.UUID
) -> list[tuple[uuid.UUID, str, Decimal, Decimal, Decimal, Decimal, Decimal]]:
    totals = allocation_totals_subquery()
    paid_amount = func.coalesce(totals.c.paid_amount, Decimal("0"))
    paid_equivalent = case(
        (
            WorkEntry.accrued_amount > 0,
            func.coalesce(WorkEntry.equivalent_quantity, Decimal("0"))
            * func.least(paid_amount / WorkEntry.accrued_amount, Decimal("1")),
        ),
        else_=Decimal("0"),
    )
    rows = (
        await session.execute(
            select(
                Operation.id,
                Operation.name,
                func.coalesce(func.sum(WorkEntry.equivalent_quantity), Decimal("0")),
                func.coalesce(func.sum(WorkEntry.time_minutes), Decimal("0")),
                func.coalesce(func.sum(WorkEntry.accrued_amount), Decimal("0")),
                func.coalesce(func.sum(totals.c.paid_amount), Decimal("0")),
                func.coalesce(func.sum(paid_equivalent), Decimal("0")),
            )
            .join(Operation, Operation.id == WorkEntry.operation_id)
            .outerjoin(totals, totals.c.work_entry_id == WorkEntry.id)
            .where(
                WorkEntry.employee_id == employee_id,
                WorkEntry.voided_at.is_(None),
            )
            .group_by(Operation.id, Operation.name)
            .order_by(Operation.name)
        )
    ).all()
    return [
        (
            row[0],
            row[1],
            Decimal(row[2]),
            Decimal(row[3]),
            Decimal(row[4]),
            Decimal(row[5]),
            Decimal(row[6]),
        )
        for row in rows
    ]
