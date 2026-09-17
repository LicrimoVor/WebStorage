import hashlib
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError
from app.modules.business.model import BusinessDocument, FundingSource, ProductUnit
from app.modules.business.schemas import ReceiptCreate, RepairCreate
from app.modules.finance.model import FinancialTransaction
from app.modules.finance.service import money, timestamp
from app.modules.inventory.repository import create_movement
from app.modules.inventory.types import MovementType
from app.modules.materials.model import Material
from app.modules.operations.model import Operation


async def validate_funding(session: AsyncSession, source_id: uuid.UUID | None) -> None:
    if source_id is None or await session.get(FundingSource, source_id) is None:
        raise DomainValidationError("Выберите существующий источник финансирования")


def document_read(document: BusinessDocument) -> dict[str, Any]:
    return {
        "id": document.id,
        "kind": document.kind,
        "created_at": document.created_at,
        "created_by": document.created_by,
        **document.data,
    }


async def register_document(
    session: AsyncSession, payload: ReceiptCreate | RepairCreate, *, key: str, actor: str
) -> dict[str, Any]:
    kind = "receipt" if isinstance(payload, ReceiptCreate) else "repair"
    fingerprint = hashlib.sha256((kind + payload.model_dump_json()).encode()).hexdigest()
    # Serialize retries before checking the unique key, including concurrent requests.
    from sqlalchemy import text

    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": key}
    )
    existing = await session.scalar(
        select(BusinessDocument).where(BusinessDocument.idempotency_key == key)
    )
    if existing:
        if existing.fingerprint != fingerprint:
            raise ConflictError("Ключ уже использован для другого документа")
        return document_read(existing)
    await validate_funding(session, payload.funding_source_id)
    document = BusinessDocument(
        id=uuid.uuid4(),
        kind=kind,
        idempotency_key=key,
        fingerprint=fingerprint,
        funding_source_id=payload.funding_source_id,
        created_by=actor,
        data=payload.model_dump(mode="json"),
    )
    session.add(document)
    await session.flush()
    snapshots = []
    if isinstance(payload, ReceiptCreate):
        for line in sorted(payload.entries, key=lambda line: str(line.material_id)):
            movement = await create_movement(
                session,
                material_id=line.material_id,
                movement_type=MovementType.RECEIPT,
                quantity=line.quantity,
                comment=payload.comment,
                source_type="receipt",
                source_id=document.id,
            )
            movement.funding_source_id = payload.funding_source_id
            movement.created_at = timestamp(payload.occurred_at)
            material = await session.get(Material, line.material_id)
            snapshots.append(
                {**line.model_dump(mode="json"), "name": material.name if material else ""}
            )
            movement.unit_price_snapshot = line.unit_price
            movement.total_amount_snapshot = money(line.quantity * line.unit_price)
            if line.defective_quantity:
                await create_movement(
                    session,
                    material_id=line.material_id,
                    movement_type=MovementType.WRITE_OFF,
                    quantity=-line.defective_quantity,
                    comment=payload.comment or "Брак при поступлении",
                    source_type="receipt_defect",
                    source_id=document.id,
                )
        document.data = {**document.data, "entries": snapshots}
    else:
        if payload.copied_from_id:
            original = await session.get(BusinessDocument, payload.copied_from_id)
            if original is None or original.kind != "repair":
                raise DomainValidationError("Исходный ремонт не найден")
        for repair_line in sorted(
            payload.materials, key=lambda repair_line: str(repair_line.material_id)
        ):
            movement = await create_movement(
                session,
                material_id=repair_line.material_id,
                movement_type=MovementType.CONSUMPTION,
                quantity=-repair_line.quantity,
                comment=payload.comment,
                source_type="repair",
                source_id=document.id,
            )
            material = await session.get(Material, repair_line.material_id)
            snapshots.append(
                {
                    "name": material.name if material else "",
                    "quantity": str(repair_line.quantity),
                    "material_id": str(repair_line.material_id),
                    "amount": str(movement.total_amount_snapshot or 0),
                }
            )
        operations = []
        for operation_line in payload.operations:
            operation = await session.get(Operation, operation_line.operation_id)
            if operation is None or operation.archived:
                raise DomainValidationError("Операция не найдена или архивирована")
            operations.append(
                {
                    **operation_line.model_dump(mode="json"),
                    "name": operation.name,
                    "rate": str(operation.price_per_operation or 0),
                    "time_norm": str(operation.time_norm or 0),
                }
            )
        # Materials were paid for at receipt; only additional repair charges affect cash.
        if payload.service_cost:
            session.add(
                FinancialTransaction(
                    transaction_type="expense",
                    amount=payload.service_cost,
                    occurred_at=timestamp(payload.occurred_at),
                    category="Ремонт",
                    comment=payload.comment,
                    created_by=actor,
                    funding_source_id=payload.funding_source_id,
                )
            )
        document.data = {
            **document.data,
            "material_costs": snapshots,
            "operation_snapshots": operations,
        }
        if payload.replacement_serial_number:
            await issue_replacement(session, payload, document.id)
    await session.commit()
    await session.refresh(document)
    return document_read(document)


async def issue_replacement(
    session: AsyncSession, payload: RepairCreate, document_id: uuid.UUID
) -> None:
    from app.modules.manufactured_items.model import ManufacturedItem
    from app.modules.manufactured_items.movement_repository import create_movement as item_movement

    replacement = await session.scalar(
        select(ProductUnit).where(ProductUnit.serial_number == payload.replacement_serial_number)
    )
    if replacement is None:
        return  # External/legacy serials are recorded in the repair history.
    await session.get(ManufacturedItem, replacement.product_id, with_for_update=True)
    await session.refresh(replacement, with_for_update=True)
    if replacement.sale_id is not None or replacement.issued_for_repair_id is not None:
        raise ConflictError("Подменное изделие уже выдано или продано")
    original = await session.scalar(
        select(ProductUnit).where(ProductUnit.serial_number == payload.serial_number)
    )
    if original is not None and original.product_id != replacement.product_id:
        raise DomainValidationError("Подменное изделие должно относиться к тому же продукту")
    await item_movement(
        session,
        item_id=replacement.product_id,
        movement_type=MovementType.CONSUMPTION,
        quantity=Decimal("-1"),
        comment=payload.comment,
        source_type="repair_replacement",
        source_id=document_id,
    )
    replacement.issued_for_repair_id = document_id


async def register_units(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    record_id: uuid.UUID,
    quantity: Decimal,
    serial_numbers: list[str],
    photo: str | None,
) -> None:
    from app.modules.manufactured_items.model import ManufacturedItem

    item = await session.get(ManufacturedItem, item_id)
    if item is None or not item.is_product:
        if serial_numbers:
            raise DomainValidationError("Номера назначаются готовой продукции")
        return
    numbers = [number.strip() for number in serial_numbers]
    if quantity != len(numbers) or any(not number for number in numbers):
        raise DomainValidationError("Укажите уникальный номер каждой единицы продукции")
    if len(set(numbers)) != len(numbers):
        raise DomainValidationError("Номера изделий не должны повторяться")
    if await session.scalar(select(ProductUnit.id).where(ProductUnit.serial_number.in_(numbers))):
        raise ConflictError("Изделие с таким номером уже существует")  # noqa: RUF001
    session.add_all(
        [
            ProductUnit(
                serial_number=number,
                product_id=item_id,
                production_record_id=record_id,
                photo=photo,
            )
            for number in numbers
        ]
    )
