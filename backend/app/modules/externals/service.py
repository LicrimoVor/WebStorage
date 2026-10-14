import hashlib
import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.modules.business.model import BusinessDocument
from app.modules.business.service import document_read
from app.modules.externals.model import ExternalOffer, ExternalProvider
from app.modules.externals.schemas import (
    ExternalMaterial,
    ExternalReceiptCreate,
    OfferRead,
    OfferWrite,
    ProviderWrite,
)
from app.modules.finance.funding import validate_allocations
from app.modules.finance.model import FinancialTransaction
from app.modules.finance.service import money, timestamp
from app.modules.inventory.repository import create_movement
from app.modules.inventory.types import MovementType
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.manufactured_items.movement_repository import create_movement as item_movement
from app.modules.materials.model import Material
from app.modules.operations.model import Operation


def operation_name(provider: str, item: str, offer_id: uuid.UUID) -> str:
    name = f"Обратиться к {provider} для {item}"
    return name if len(name) <= 200 else name[:190] + " " + str(offer_id)[:8]


async def save_provider(
    session: AsyncSession, payload: ProviderWrite, provider_id: uuid.UUID | None = None
) -> ExternalProvider:
    provider = (
        await session.get(ExternalProvider, provider_id, with_for_update=True)
        if provider_id
        else ExternalProvider()
    )
    if provider is None:
        raise NotFoundError("Исполнитель не найден")
    duplicate = await session.scalar(
        select(ExternalProvider.id).where(func.lower(ExternalProvider.name) == payload.name.lower())
    )
    if duplicate and duplicate != provider.id:
        raise ConflictError("Такое название исполнителя уже существует")
    provider.name = payload.name
    session.add(provider)
    if provider_id:
        rows = (
            await session.execute(
                select(ExternalOffer, ManufacturedItem)
                .join(ManufacturedItem, ManufacturedItem.id == ExternalOffer.item_id)
                .where(ExternalOffer.provider_id == provider_id)
            )
        ).all()
        for offer, item in rows:
            operation = await session.get(Operation, offer.operation_id, with_for_update=True)
            if operation:
                operation.name = operation_name(provider.name, item.name, offer.id)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("Такое название исполнителя уже существует") from error
    await session.refresh(provider)
    return provider


async def offers(session: AsyncSession, provider_id: uuid.UUID | None = None) -> list[OfferRead]:
    query = (
        select(ExternalOffer, ExternalProvider, ManufacturedItem)
        .join(ExternalProvider, ExternalProvider.id == ExternalOffer.provider_id)
        .join(ManufacturedItem, ManufacturedItem.id == ExternalOffer.item_id)
        .where(ManufacturedItem.archived.is_(False))
        .order_by(ManufacturedItem.name, ExternalProvider.name)
    )
    if provider_id:
        query = query.where(ExternalOffer.provider_id == provider_id)
    return [
        OfferRead(
            id=offer.id,
            operation_id=offer.operation_id,
            provider_id=provider.id,
            provider_name=provider.name,
            item_id=item.id,
            item_name=item.name,
            unit=item.unit,
            money_cost=offer.money_cost,
            materials=[ExternalMaterial.model_validate(line) for line in offer.materials],
            active=offer.active,
        )
        for offer, provider, item in (await session.execute(query)).all()
    ]


async def save_offer(
    session: AsyncSession, payload: OfferWrite, offer_id: uuid.UUID | None = None
) -> OfferRead:
    provider = await session.get(ExternalProvider, payload.provider_id, with_for_update=True)
    item = await session.get(ManufacturedItem, payload.item_id)
    if provider is None or item is None or item.archived or item.is_product:
        raise DomainValidationError("Выберите исполнителя и действующий полуфабрикат")
    for line in payload.materials:
        material = await session.get(Material, line.material_id)
        if material is None or material.archived:
            raise DomainValidationError("Материал не найден или архивирован")
    offer = (
        await session.get(ExternalOffer, offer_id, with_for_update=True)
        if offer_id
        else ExternalOffer(id=uuid.uuid4())
    )
    if offer is None:
        raise NotFoundError("Условия исполнителя не найдены")
    if offer_id and (offer.provider_id != payload.provider_id or offer.item_id != payload.item_id):
        raise DomainValidationError("Для другого исполнителя или п/ф создайте новые условия")
    duplicate = await session.scalar(
        select(ExternalOffer.id).where(
            ExternalOffer.provider_id == provider.id, ExternalOffer.item_id == item.id
        )
    )
    if duplicate and duplicate != offer.id:
        raise ConflictError("Этот п/ф уже прикреплён к исполнителю")
    operation = (
        await session.get(Operation, offer.operation_id, with_for_update=True)
        if offer_id
        else Operation(id=uuid.uuid4())
    )
    if operation is None:
        raise NotFoundError("Операция не найдена")
    operation.name = operation_name(provider.name, item.name, offer.id)
    operation.price_per_operation = payload.money_cost
    operation.archived = not payload.active
    session.add(operation)
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("Такое название операции уже существует") from error
    offer.provider_id, offer.item_id, offer.operation_id = provider.id, item.id, operation.id
    offer.money_cost, offer.materials, offer.active = (
        payload.money_cost,
        [line.model_dump(mode="json") for line in payload.materials],
        payload.active,
    )
    session.add(offer)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("Этот п/ф уже прикреплён к исполнителю") from error
    return next(entry for entry in await offers(session, provider.id) if entry.id == offer.id)


async def receive(
    session: AsyncSession, payload: ExternalReceiptCreate, key: str, actor: str
) -> dict[str, Any]:
    fingerprint = hashlib.sha256(
        ("external_receipt" + payload.model_dump_json()).encode()
    ).hexdigest()
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
    offer = await session.get(ExternalOffer, payload.offer_id, with_for_update=True)
    if offer is None or not offer.active:
        raise DomainValidationError("Выберите действующие условия внешнего исполнителя")
    provider = await session.get(ExternalProvider, offer.provider_id)
    item = await session.get(ManufacturedItem, offer.item_id, with_for_update=True)
    operation = await session.get(Operation, offer.operation_id)
    if (
        item is None
        or item.archived
        or item.is_product
        or provider is None
        or operation is None
        or operation.archived
    ):
        raise DomainValidationError("Полуфабрикат или операция недоступны")
    raw_total = offer.money_cost * payload.quantity
    if raw_total > Decimal("999999999999999999.99"):
        raise DomainValidationError("Сумма расходов слишком велика")
    total = money(raw_total)
    allocations = await validate_allocations(session, payload, total)
    document = BusinessDocument(
        id=uuid.uuid4(),
        kind="external_receipt",
        idempotency_key=key,
        fingerprint=fingerprint,
        funding_source_id=payload.funding_source_id,
        funding_allocations=allocations,
        created_by=actor,
        data={},
    )
    session.add(document)
    await session.flush()
    spent = []
    for line in sorted(offer.materials, key=lambda entry: entry["material_id"]):
        raw_quantity = Decimal(str(line["quantity"])) * payload.quantity
        if raw_quantity > Decimal("99999999999999.999999"):
            raise DomainValidationError("Расход материала слишком велик")
        amount = raw_quantity.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
        if amount <= 0:
            raise DomainValidationError("Количество слишком мало для списания материалов")
        movement = await create_movement(
            session,
            material_id=uuid.UUID(line["material_id"]),
            movement_type=MovementType.CONSUMPTION,
            quantity=-amount,
            comment=payload.comment or operation.name,
            source_type="external_receipt",
            source_id=document.id,
        )
        movement.created_at = timestamp(payload.occurred_at)
        material = await session.get(Material, uuid.UUID(line["material_id"]))
        spent.append(
            {
                "material_id": line["material_id"],
                "name": material.name if material else "",
                "quantity": str(amount),
            }
        )
    movement_item = await item_movement(
        session,
        item_id=item.id,
        movement_type=MovementType.RECEIPT,
        quantity=payload.quantity,
        comment=payload.comment or operation.name,
        source_type="external_receipt",
        source_id=document.id,
    )
    movement_item.created_at = timestamp(payload.occurred_at)
    if total > 0:
        session.add(
            FinancialTransaction(
                document_id=document.id,
                transaction_type="expense",
                amount=total,
                occurred_at=timestamp(payload.occurred_at),
                category="Внешние исполнители",
                comment=payload.comment or operation.name,
                created_by=actor,
                funding_source_id=payload.funding_source_id,
                funding_allocations=allocations,
            )
        )
    document.data = {
        **payload.model_dump(mode="json"),
        "provider_name": provider.name,
        "total_amount": str(total),
        "operation_name": operation.name,
        "spent_materials": spent,
        "entries": [
            {"material_id": str(item.id), "name": item.name, "quantity": str(payload.quantity)}
        ],
    }
    from app.modules.production_plans.service import recalculate_active_snapshots

    await recalculate_active_snapshots(session)
    await session.commit()
    return document_read(document)
