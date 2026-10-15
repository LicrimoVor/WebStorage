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
from app.modules.trash.model import visible_entry


async def visible_provider(session: AsyncSession, provider_id: uuid.UUID) -> bool:
    return bool(
        await session.scalar(
            select(ExternalProvider.id).where(
                ExternalProvider.id == provider_id,
                visible_entry(ExternalProvider.id, "external_provider"),
            )
        )
    )


async def visible_offer(session: AsyncSession, offer_id: uuid.UUID) -> bool:
    return bool(
        await session.scalar(
            select(ExternalOffer.id).where(
                ExternalOffer.id == offer_id,
                visible_entry(ExternalOffer.id, "external_offer"),
            )
        )
    )


async def save_provider(
    session: AsyncSession, payload: ProviderWrite, provider_id: uuid.UUID | None = None
) -> ExternalProvider:
    provider = (
        await session.get(ExternalProvider, provider_id, with_for_update=True)
        if provider_id
        else ExternalProvider()
    )
    if provider is None or (provider_id and not await visible_provider(session, provider_id)):
        raise NotFoundError("Исполнитель не найден")
    duplicate = await session.scalar(
        select(ExternalProvider.id).where(func.lower(ExternalProvider.name) == payload.name.lower())
    )
    if duplicate and duplicate != provider.id:
        raise ConflictError("Такое название исполнителя уже существует")
    provider.name = payload.name
    session.add(provider)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("Такое название исполнителя уже существует") from error
    await session.refresh(provider)
    return provider


async def recipe(
    session: AsyncSession, version_id: uuid.UUID
) -> tuple[list[ExternalMaterial], Decimal]:
    from app.modules.production_plans.service import CalculationContext, _expand_version
    from app.modules.technological_processes.model import TechnologicalProcessVersion

    version = await session.get(TechnologicalProcessVersion, version_id)
    if version is None or version.deleted_at is not None or version.validation_errors:
        raise DomainValidationError("Версия техпроцесса недоступна")
    context = CalculationContext(session, item_stock={}, material_stock={})
    await _expand_version(context, version, Decimal("1"), item_stack=(), version_overrides={})
    return (
        [
            ExternalMaterial(material_id=id, quantity=line.quantity)
            for id, line in context.materials.items()
        ],
        money(
            sum(
                (
                    line.quantity * (line.operation.price_per_operation or Decimal("0"))
                    for line in context.operations.values()
                ),
                Decimal("0"),
            )
        ),
    )


async def offers(session: AsyncSession, provider_id: uuid.UUID | None = None) -> list[OfferRead]:
    from app.modules.technological_processes.model import (
        TechnologicalProcess,
        TechnologicalProcessVersion,
    )

    query = (
        select(ExternalOffer, ExternalProvider, ManufacturedItem)
        .join(ExternalProvider, ExternalProvider.id == ExternalOffer.provider_id)
        .join(ManufacturedItem, ManufacturedItem.id == ExternalOffer.item_id)
        .where(ManufacturedItem.archived.is_(False))
        .where(
            visible_entry(ExternalProvider.id, "external_provider"),
            visible_entry(ExternalOffer.id, "external_offer"),
        )
        .order_by(ManufacturedItem.name, ExternalProvider.name)
    )
    if provider_id:
        query = query.where(ExternalOffer.provider_id == provider_id)
    result = []
    for offer, provider, item in (await session.execute(query)).all():
        version = (
            await session.get(TechnologicalProcessVersion, offer.process_version_id)
            if offer.process_version_id
            else None
        )
        process = await session.get(TechnologicalProcess, version.process_id) if version else None
        available = bool(
            version
            and version.deleted_at is None
            and not version.validation_errors
            and process
            and not process.archived
        )
        materials, cost = (
            await recipe(session, version.id)
            if version and available
            else (
                [ExternalMaterial.model_validate(line) for line in offer.materials],
                offer.money_cost,
            )
        )
        result.append(
            OfferRead(
                id=offer.id,
                process_id=process.id if process else uuid.UUID(int=0),
                process_version_id=offer.process_version_id,
                process_name=process.name if process else "Выберите техпроцесс",
                provider_id=provider.id,
                provider_name=provider.name,
                item_id=item.id,
                item_name=item.name,
                unit=item.unit,
                money_cost=cost,
                materials=materials,
                active=offer.active and available,
            )
        )
    return result


async def save_offer(
    session: AsyncSession, payload: OfferWrite, offer_id: uuid.UUID | None = None
) -> OfferRead:
    from app.modules.technological_processes.model import (
        TechnologicalProcess,
        TechnologicalProcessVersion,
    )

    provider = await session.get(ExternalProvider, payload.provider_id, with_for_update=True)
    if not await visible_provider(session, payload.provider_id):
        raise NotFoundError("Исполнитель не найден")
    process = await session.get(TechnologicalProcess, payload.process_id)
    item = (
        await session.get(ManufacturedItem, process.output_item_id)
        if process and process.output_item_id
        else None
    )
    if (
        provider is None
        or process is None
        or process.archived
        or item is None
        or item.archived
        or item.is_product
    ):
        raise DomainValidationError("Выберите исполнителя и действующий техпроцесс полуфабриката")
    version = await session.scalar(
        select(TechnologicalProcessVersion).where(
            TechnologicalProcessVersion.process_id == process.id,
            TechnologicalProcessVersion.status == "active",
            TechnologicalProcessVersion.deleted_at.is_(None),
        )
    )
    if version is None:
        raise DomainValidationError("У техпроцесса нет активной версии")  # noqa: RUF001
    materials, cost = await recipe(session, version.id)
    offer = (
        await session.get(ExternalOffer, offer_id, with_for_update=True)
        if offer_id
        else ExternalOffer(id=uuid.uuid4())
    )
    if offer is None or (offer_id and not await visible_offer(session, offer_id)):
        raise NotFoundError("Условия исполнителя не найдены")
    if offer_id and offer.provider_id != provider.id:
        raise DomainValidationError("Нельзя изменить исполнителя условий")
    offer.provider_id, offer.item_id, offer.process_version_id = provider.id, item.id, version.id
    offer.money_cost, offer.materials, offer.active = (
        cost,
        [line.model_dump(mode="json") for line in materials],
        payload.active,
    )
    session.add(offer)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("Этот техпроцесс уже прикреплён к исполнителю") from error
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
    offer = await session.get(ExternalOffer, payload.offer_id)
    if offer is None:
        raise DomainValidationError("Выберите действующие условия внешнего исполнителя")
    provider = await session.get(ExternalProvider, offer.provider_id, with_for_update=True)
    await session.refresh(offer, with_for_update=True)
    if (
        not offer.active
        or not await visible_offer(session, offer.id)
        or not await visible_provider(session, offer.provider_id)
    ):
        raise DomainValidationError("Выберите действующие условия внешнего исполнителя")
    item = await session.get(ManufacturedItem, offer.item_id, with_for_update=True)
    from app.modules.technological_processes.model import (
        TechnologicalProcess,
        TechnologicalProcessVersion,
    )

    version = (
        await session.get(TechnologicalProcessVersion, offer.process_version_id)
        if offer.process_version_id
        else None
    )
    process = await session.get(TechnologicalProcess, version.process_id) if version else None
    if (
        item is None
        or item.archived
        or item.is_product
        or provider is None
        or process is None
        or process.archived
    ):
        raise DomainValidationError("Полуфабрикат или операция недоступны")
    if version is None:
        raise DomainValidationError("Выберите техпроцесс исполнителя")
    materials, cost = await recipe(session, version.id)
    description = f"Приход от {provider.name}: {item.name}"
    raw_total = cost * payload.quantity
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
    for line in sorted(
        [entry.model_dump(mode="json") for entry in materials],
        key=lambda entry: entry["material_id"],
    ):
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
            comment=payload.comment or description,
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
        comment=payload.comment or description,
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
                comment=payload.comment or description,
                created_by=actor,
                funding_source_id=payload.funding_source_id,
                funding_allocations=allocations,
            )
        )
    document.data = {
        **payload.model_dump(mode="json"),
        "provider_name": provider.name,
        "total_amount": str(total),
        "process_name": process.name,
        "process_version_id": str(version.id),
        "spent_materials": spent,
        "entries": [
            {"material_id": str(item.id), "name": item.name, "quantity": str(payload.quantity)}
        ],
    }
    from app.modules.production_plans.service import recalculate_active_snapshots

    await recalculate_active_snapshots(session)
    await session.commit()
    return document_read(document)
