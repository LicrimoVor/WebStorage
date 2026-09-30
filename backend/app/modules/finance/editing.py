import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.core.types import Money
from app.modules.business.model import BusinessDocument
from app.modules.employees.model import Employee
from app.modules.finance.funding import FundingWrite, validate_allocations
from app.modules.finance.model import FinanceChange, FinancialTransaction
from app.modules.finance.repository import entry_union
from app.modules.finance.service import money, timestamp
from app.modules.inventory.model import InventoryMovement
from app.modules.payroll.model import EmployeePayment, PaymentAllocation
from app.modules.payroll.repository import outstanding_entries
from app.modules.sales.model import Sale


class FinanceEdit(FundingWrite):
    amount: Money = Field(gt=0)
    occurred_at: datetime
    comment: str = Field(default="", max_length=2000)
    funding_source_id: uuid.UUID
    reason: str = Field(min_length=1, max_length=2000)
    revision: int = Field(ge=0)


async def snapshot(session: AsyncSession, entry_id: uuid.UUID) -> dict[str, Any]:
    entries = entry_union()
    row = (
        (await session.execute(select(entries).where(entries.c.id == entry_id)))
        .mappings()
        .one_or_none()
    )
    if row is None:
        raise NotFoundError("Финансовая операция не найдена")
    return {
        k: str(v)
        if isinstance(v, (uuid.UUID, Decimal))
        else v.isoformat()
        if isinstance(v, datetime)
        else v
        for k, v in row.items()
    }


async def details(session: AsyncSession, entry_id: uuid.UUID) -> dict[str, Any]:
    entry = await snapshot(session, entry_id)
    history = list(
        await session.scalars(
            select(FinanceChange)
            .where(FinanceChange.entry_id == entry_id)
            .order_by(FinanceChange.created_at, FinanceChange.id)
        )
    )
    # Use the same committed revision for the editable fields and revision counter,
    # even if another administrator commits between the two reads above.
    if history:
        entry = {**entry, **history[-1].after}
    return {
        "entry": entry,
        "revision": len(history),
        "history": [
            {
                "id": h.id,
                "before": h.before,
                "after": h.after,
                "reason": h.reason,
                "created_by": h.created_by,
                "created_at": h.created_at,
            }
            for h in history
        ],
    }


async def edit(
    session: AsyncSession, entry_id: uuid.UUID, payload: FinanceEdit, actor: str
) -> dict[str, Any]:
    if not payload.reason.strip():
        raise DomainValidationError("Укажите причину изменения")
    # Payroll operations use the same employee lock as registration/voiding work.
    payment = await session.get(EmployeePayment, entry_id)
    if payment:
        await session.get(Employee, payment.employee_id, with_for_update=True)
    target: (
        FinancialTransaction | Sale | EmployeePayment | InventoryMovement | BusinessDocument | None
    ) = None
    for model in (FinancialTransaction, Sale, EmployeePayment, InventoryMovement, BusinessDocument):
        candidate = await session.get(model, entry_id, with_for_update=True, populate_existing=True)
        if isinstance(
            candidate,
            (FinancialTransaction, Sale, EmployeePayment, InventoryMovement, BusinessDocument),
        ):
            target = candidate
            break
    if target is None:
        raise NotFoundError("Финансовая операция не найдена")
    before = await snapshot(session, entry_id)
    revision = await session.scalar(
        select(func.count()).select_from(FinanceChange).where(FinanceChange.entry_id == entry_id)
    )
    if revision != payload.revision:
        raise ConflictError("Запись уже изменена. Закройте и откройте её заново")
    allocations = await validate_allocations(session, payload, payload.amount)
    occurred = timestamp(payload.occurred_at)
    if isinstance(target, FinancialTransaction):
        target.amount = payload.amount
        target.occurred_at = occurred
        if target.document_id:
            document = await session.get(BusinessDocument, target.document_id, with_for_update=True)
            if document:
                document.data = {
                    **document.data,
                    "service_cost": str(payload.amount),
                    "occurred_at": occurred.isoformat(),
                    "comment": payload.comment,
                    "funding_source_id": str(payload.funding_source_id),
                    "funding_allocations": allocations,
                }
                document.funding_source_id = payload.funding_source_id
                document.funding_allocations = allocations
    elif isinstance(target, Sale):
        unit_price = money(payload.amount / target.quantity)
        if money(unit_price * target.quantity) != payload.amount:
            raise DomainValidationError(
                "Укажите сумму, равную количеству, умноженному на цену до копеек"
            )
        target.unit_price = unit_price
        target.total_amount = payload.amount
        target.sold_at = occurred
    elif isinstance(target, EmployeePayment):
        if payload.amount != target.amount:
            # Release this payment only; other payments remain untouched.
            await session.execute(
                delete(PaymentAllocation).where(PaymentAllocation.payment_id == target.id)
            )
            await session.flush()
            remaining = payload.amount
            for entry, paid in await outstanding_entries(session, target.employee_id):
                part = min(remaining, (entry.accrued_amount or Decimal("0")) - paid)
                if part > 0:
                    session.add(
                        PaymentAllocation(payment_id=target.id, work_entry_id=entry.id, amount=part)
                    )
                    remaining -= part
                if remaining == 0:
                    break
            if remaining:
                raise DomainValidationError("Сумма выплаты превышает задолженность сотруднику")
            target.allocation_mode = "fifo"
        target.amount = payload.amount
        target.paid_at = occurred
    elif isinstance(target, InventoryMovement):
        target.total_amount_snapshot = payload.amount
        target.unit_price_snapshot = money(payload.amount / abs(target.quantity))
        target.created_at = occurred
        if target.source_id:
            document = await session.get(BusinessDocument, target.source_id, with_for_update=True)
            if document and document.kind == "receipt":
                document.data = {
                    **document.data,
                    "entries": [
                        {
                            **line,
                            "unit_price": str(target.unit_price_snapshot),
                            "total_amount": str(payload.amount),
                            "occurred_at": occurred.isoformat(),
                            "comment": payload.comment,
                            "funding_source_id": str(payload.funding_source_id),
                            "funding_allocations": allocations,
                        }
                        if line.get("material_id") == str(target.material_id)
                        else line
                        for line in document.data.get("entries", [])
                    ],
                }
    else:
        target.data = {
            **target.data,
            "total_amount": str(payload.amount),
            "occurred_at": occurred.isoformat(),
            "comment": payload.comment,
            "funding_source_id": str(payload.funding_source_id),
            "funding_allocations": allocations,
        }
    target.funding_source_id = payload.funding_source_id
    target.funding_allocations = allocations
    if not isinstance(target, BusinessDocument):
        target.comment = payload.comment
    await session.flush()
    after = await snapshot(session, entry_id)
    session.add(
        FinanceChange(
            entry_id=entry_id,
            before=before,
            after=after,
            reason=payload.reason.strip(),
            created_by=actor,
        )
    )
    await session.commit()
    return await details(session, entry_id)
