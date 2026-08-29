import math
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.modules.employees import repository as employee_repository
from app.modules.operations import repository as operation_repository
from app.modules.operations.model import Operation
from app.modules.payroll import repository
from app.modules.payroll.model import EmployeePayment, PaymentAllocation, WorkEntry
from app.modules.payroll.schemas import (
    EmployeeOperationSummary,
    EmployeePayrollSummary,
    PaymentAllocationRead,
    PaymentCreate,
    PaymentList,
    PaymentRead,
    WorkEntryCreate,
    WorkEntryList,
    WorkEntryRead,
    WorkEntryUpdate,
    WorkEntryVoid,
    WorkInputMode,
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


def calculate(
    *,
    input_mode: WorkInputMode | str,
    input_value: Decimal,
    time_norm: Decimal | None,
    rate: Decimal | None,
) -> tuple[Decimal | None, Decimal | None, Decimal | None]:
    equivalent: Decimal | None
    minutes: Decimal | None
    if input_mode == WorkInputMode.QUANTITY:
        equivalent = quantity(input_value)
        minutes = quantity(input_value * time_norm) if time_norm is not None else None
    else:
        minutes = quantity(input_value)
        equivalent = quantity(input_value / time_norm) if time_norm is not None else None
    accrued = money(equivalent * rate) if equivalent is not None and rate is not None else None
    return equivalent, minutes, accrued


def calculation_message(entry: WorkEntry) -> str | None:
    missing: list[str] = []
    if entry.input_mode == WorkInputMode.TIME and entry.time_norm_snapshot is None:
        missing.append("operation time norm")
    if entry.rate_snapshot is None:
        missing.append("operation rate")
    if not missing:
        return None
    return "Automatic accrual is unavailable: missing " + " and ".join(missing)


def to_work_read(
    entry: WorkEntry,
    *,
    employee_name: str,
    operation_name: str,
    paid_amount: Decimal,
) -> WorkEntryRead:
    accrued = entry.accrued_amount or Decimal("0")
    payable = max(accrued - paid_amount, Decimal("0"))
    return WorkEntryRead(
        id=entry.id,
        employee_id=entry.employee_id,
        employee_name=employee_name,
        operation_id=entry.operation_id,
        operation_name=operation_name,
        input_mode=WorkInputMode(entry.input_mode),
        input_value=entry.input_value,
        equivalent_quantity=entry.equivalent_quantity,
        time_minutes=entry.time_minutes,
        time_norm_snapshot=entry.time_norm_snapshot,
        rate_snapshot=entry.rate_snapshot,
        accrued_amount=entry.accrued_amount,
        paid_amount=paid_amount,
        payable_amount=payable,
        calculation_message=calculation_message(entry),
        performed_at=entry.performed_at,
        comment=entry.comment,
        created_by=entry.created_by,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        voided_at=entry.voided_at,
        voided_by=entry.voided_by,
        void_reason=entry.void_reason,
    )


async def _read_work_entry(session: AsyncSession, entry: WorkEntry) -> WorkEntryRead:
    details = await repository.work_entry_details(session, [entry.id])
    employee_name, operation_name, paid_amount = details[entry.id]
    return to_work_read(
        entry,
        employee_name=employee_name,
        operation_name=operation_name,
        paid_amount=paid_amount,
    )


async def create_work_entry(
    session: AsyncSession,
    *,
    operation_id: uuid.UUID,
    payload: WorkEntryCreate,
    created_by: str,
) -> WorkEntryRead:
    operation = await operation_repository.get_operation(session, operation_id)
    if operation is None:
        raise NotFoundError("Operation was not found")
    if operation.archived:
        raise DomainValidationError("Work cannot be recorded for an archived operation")
    employee = await employee_repository.get_employee(session, payload.employee_id)
    if employee is None:
        raise NotFoundError("Employee was not found")
    if not employee.active:
        raise DomainValidationError("Work cannot be recorded for an inactive employee")
    equivalent, minutes, accrued = calculate(
        input_mode=payload.input_mode,
        input_value=payload.input_value,
        time_norm=operation.time_norm,
        rate=operation.price_per_operation,
    )
    entry = WorkEntry(
        employee_id=employee.id,
        operation_id=operation.id,
        input_mode=payload.input_mode.value,
        input_value=quantity(payload.input_value),
        equivalent_quantity=equivalent,
        time_minutes=minutes,
        time_norm_snapshot=operation.time_norm,
        rate_snapshot=operation.price_per_operation,
        accrued_amount=accrued,
        performed_at=timestamp(payload.performed_at),
        comment=payload.comment,
        created_by=created_by,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return await _read_work_entry(session, entry)


async def get_work_entry(session: AsyncSession, work_entry_id: uuid.UUID) -> WorkEntryRead:
    entry = await repository.get_work_entry(session, work_entry_id)
    if entry is None:
        raise NotFoundError("Work entry was not found")
    return await _read_work_entry(session, entry)


async def list_work_entries(
    session: AsyncSession,
    *,
    operation_id: uuid.UUID | None,
    employee_id: uuid.UUID | None,
    include_voided: bool,
    page: int,
    page_size: int,
) -> WorkEntryList:
    if operation_id is not None and await operation_repository.get_operation(
        session, operation_id
    ) is None:
        raise NotFoundError("Operation was not found")
    if employee_id is not None and await employee_repository.get_employee(
        session, employee_id
    ) is None:
        raise NotFoundError("Employee was not found")
    entries, total = await repository.list_work_entries(
        session,
        operation_id=operation_id,
        employee_id=employee_id,
        include_voided=include_voided,
        page=page,
        page_size=page_size,
    )
    details = await repository.work_entry_details(session, [entry.id for entry in entries])
    items = [
        to_work_read(
            entry,
            employee_name=details[entry.id][0],
            operation_name=details[entry.id][1],
            paid_amount=details[entry.id][2],
        )
        for entry in entries
    ]
    return WorkEntryList(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def update_work_entry(
    session: AsyncSession,
    *,
    work_entry_id: uuid.UUID,
    payload: WorkEntryUpdate,
) -> WorkEntryRead:
    entry = await repository.get_work_entry(session, work_entry_id, for_update=True)
    if entry is None:
        raise NotFoundError("Work entry was not found")
    if entry.voided_at is not None:
        raise ConflictError("A voided work entry cannot be edited")
    if await repository.paid_for_work_entry(session, entry.id) > 0:
        raise ConflictError("A paid work entry cannot be edited")
    if payload.employee_id is not None and payload.employee_id != entry.employee_id:
        employee = await employee_repository.get_employee(session, payload.employee_id)
        if employee is None:
            raise NotFoundError("Employee was not found")
        if not employee.active:
            raise DomainValidationError("Work cannot be assigned to an inactive employee")
        entry.employee_id = employee.id
    if payload.input_mode is not None:
        entry.input_mode = payload.input_mode.value
    if payload.input_value is not None:
        entry.input_value = quantity(payload.input_value)
    if "performed_at" in payload.model_fields_set and payload.performed_at is not None:
        entry.performed_at = timestamp(payload.performed_at)
    if "comment" in payload.model_fields_set:
        entry.comment = payload.comment
    equivalent, minutes, accrued = calculate(
        input_mode=entry.input_mode,
        input_value=entry.input_value,
        time_norm=entry.time_norm_snapshot,
        rate=entry.rate_snapshot,
    )
    entry.equivalent_quantity = equivalent
    entry.time_minutes = minutes
    entry.accrued_amount = accrued
    await session.commit()
    await session.refresh(entry)
    return await _read_work_entry(session, entry)


async def void_work_entry(
    session: AsyncSession,
    *,
    work_entry_id: uuid.UUID,
    payload: WorkEntryVoid,
    voided_by: str,
) -> WorkEntryRead:
    entry = await repository.get_work_entry(session, work_entry_id, for_update=True)
    if entry is None:
        raise NotFoundError("Work entry was not found")
    if entry.voided_at is not None:
        return await _read_work_entry(session, entry)
    if await repository.paid_for_work_entry(session, entry.id) > 0:
        raise ConflictError("A paid work entry cannot be voided")
    entry.voided_at = datetime.now(UTC)
    entry.voided_by = voided_by
    entry.void_reason = payload.reason
    await session.commit()
    await session.refresh(entry)
    return await _read_work_entry(session, entry)


def to_payment_read(
    payment: EmployeePayment,
    *,
    employee_name: str,
    allocations: Sequence[tuple[PaymentAllocation, WorkEntry, Operation]],
) -> PaymentRead:
    return PaymentRead(
        id=payment.id,
        employee_id=payment.employee_id,
        employee_name=employee_name,
        amount=payment.amount,
        paid_at=payment.paid_at,
        comment=payment.comment,
        created_by=payment.created_by,
        created_at=payment.created_at,
        allocation_mode=payment.allocation_mode,
        allocations=[
            PaymentAllocationRead(
                work_entry_id=allocation.work_entry_id,
                operation_id=work_entry.operation_id,
                operation_name=operation.name,
                performed_at=work_entry.performed_at,
                amount=allocation.amount,
            )
            for allocation, work_entry, operation in allocations
        ],
    )


async def create_payment(
    session: AsyncSession,
    *,
    employee_id: uuid.UUID,
    payload: PaymentCreate,
    created_by: str,
) -> PaymentRead:
    employee = await employee_repository.get_employee(session, employee_id, for_update=True)
    if employee is None:
        raise NotFoundError("Employee was not found")
    outstanding = await repository.outstanding_entries(session, employee_id)
    outstanding_by_id = {
        entry.id: (entry, money((entry.accrued_amount or Decimal("0")) - paid))
        for entry, paid in outstanding
    }
    available = money(sum((value[1] for value in outstanding_by_id.values()), Decimal("0")))
    if payload.amount > available:
        raise DomainValidationError(
            f"Payment exceeds the employee payable amount ({available})"
        )
    requested: list[tuple[WorkEntry, Decimal]] = []
    allocation_mode = "manual" if payload.allocations is not None else "fifo"
    if payload.allocations is not None:
        for item in payload.allocations:
            target = outstanding_by_id.get(item.work_entry_id)
            if target is None:
                raise DomainValidationError(
                    "A manual allocation targets another employee, a voided entry, "
                    "or a fully paid entry"
                )
            entry, entry_available = target
            if item.amount > entry_available:
                raise DomainValidationError(
                    f"Allocation for work entry {entry.id} exceeds its payable amount"
                )
            requested.append((entry, money(item.amount)))
    else:
        remaining = money(payload.amount)
        for entry, entry_available in outstanding_by_id.values():
            if remaining == 0:
                break
            allocated = min(remaining, entry_available)
            requested.append((entry, allocated))
            remaining = money(remaining - allocated)
        if remaining != 0:
            raise ConflictError("Payment allocation could not be completed")
    now = datetime.now(UTC)
    payment = EmployeePayment(
        employee_id=employee.id,
        amount=money(payload.amount),
        paid_at=timestamp(payload.paid_at),
        comment=payload.comment,
        created_by=created_by,
        allocation_mode=allocation_mode,
        created_at=now,
    )
    session.add(payment)
    await session.flush()
    allocations = [
        PaymentAllocation(
            payment_id=payment.id,
            work_entry_id=entry.id,
            amount=allocated,
        )
        for entry, allocated in requested
    ]
    session.add_all(allocations)
    await session.commit()
    allocation_map = await repository.payment_allocations(session, [payment.id])
    return to_payment_read(
        payment,
        employee_name=employee.full_name,
        allocations=allocation_map[payment.id],
    )


async def list_payments(
    session: AsyncSession,
    *,
    employee_id: uuid.UUID,
    page: int,
    page_size: int,
) -> PaymentList:
    employee = await employee_repository.get_employee(session, employee_id)
    if employee is None:
        raise NotFoundError("Employee was not found")
    payments, total = await repository.list_payments(
        session, employee_id=employee_id, page=page, page_size=page_size
    )
    allocation_map = await repository.payment_allocations(
        session, [payment.id for payment in payments]
    )
    return PaymentList(
        items=[
            to_payment_read(
                payment,
                employee_name=employee.full_name,
                allocations=allocation_map[payment.id],
            )
            for payment in payments
        ],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def payroll_summary(
    session: AsyncSession, employee_id: uuid.UUID
) -> EmployeePayrollSummary:
    employee = await employee_repository.get_employee(session, employee_id)
    if employee is None:
        raise NotFoundError("Employee was not found")
    totals = await repository.employee_totals(session, [employee_id])
    accrued, paid, completed = totals.get(
        employee_id, (Decimal("0"), Decimal("0"), Decimal("0"))
    )
    rows = await repository.employee_operation_totals(session, employee_id)
    operations = [
        EmployeeOperationSummary(
            operation_id=row[0],
            operation_name=row[1],
            completed_quantity=Decimal(row[2]),
            time_minutes=Decimal(row[3]),
            accrued_amount=Decimal(row[4]),
            paid_amount=Decimal(row[5]),
            payable_amount=max(Decimal(row[4]) - Decimal(row[5]), Decimal("0")),
        )
        for row in rows
    ]
    return EmployeePayrollSummary(
        employee_id=employee_id,
        accrued_total=accrued,
        paid_total=paid,
        payable_total=max(accrued - paid, Decimal("0")),
        completed_operations=completed,
        operations=operations,
    )
