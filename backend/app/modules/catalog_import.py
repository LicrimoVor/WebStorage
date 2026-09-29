"""Atomic JSON imports for warehouse catalogs and operations."""

from decimal import Decimal
from typing import Annotated, Literal, Self

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ConflictError
from app.core.types import Money, Quantity
from app.modules.inventory.repository import create_movement
from app.modules.inventory.types import MovementType
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.manufactured_items.movement_repository import (
    create_movement as create_item_movement,
)
from app.modules.materials.model import Material
from app.modules.materials.uniqueness import lock_material_catalog, validate_material_name
from app.modules.operations.groups import lock_groups
from app.modules.operations.model import Operation, OperationGroup
from app.modules.warehouse.model import (
    InventoryGroup,
    InventoryGroupManufacturedItem,
    InventoryGroupMaterial,
)

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Unit = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]


class ImportModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StockEntry(ImportModel):
    name: Name
    unit: Unit
    initial_quantity: Quantity = Field(default=Decimal(0), ge=0)


class MaterialEntry(StockEntry):
    price: Money | None = None
    group: list[Name] = Field(default_factory=list, max_length=2)


class SemiFinishedEntry(StockEntry):
    product: Name
    group: list[Name] = Field(default_factory=list, max_length=2)


class WarehouseImport(ImportModel):
    version: Literal[1]
    materials: list[MaterialEntry] = Field(default_factory=list, max_length=500)
    products: list[StockEntry] = Field(default_factory=list, max_length=500)
    semi_finished: list[SemiFinishedEntry] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def check_size(self) -> Self:
        if not 1 <= len(self.materials) + len(self.products) + len(self.semi_finished) <= 500:
            raise ValueError("Импорт должен содержать от 1 до 500 записей")
        return self


class OperationEntry(ImportModel):
    name: Name
    group: Name | Annotated[list[Name], Field(min_length=1, max_length=2)] | None = None
    time_norm: Quantity | None = Field(default=None, gt=0)
    price_per_operation: Money | None = None


class OperationsImport(ImportModel):
    version: Literal[1]
    operations: list[OperationEntry] = Field(min_length=1, max_length=500)


class ImportResult(BaseModel):
    created: int


class ImportPreview(BaseModel):
    new_groups: list[list[str]]


router = APIRouter(tags=["catalog-import"])
Session = Annotated[AsyncSession, Depends(get_session)]


@router.post("/warehouse/import/preview", operation_id="previewWarehouseImport")
async def preview_warehouse(payload: WarehouseImport, session: Session) -> ImportPreview:
    groups = list((await session.scalars(select(InventoryGroup))).all())
    by_id = {group.id: group.name.lower() for group in groups}
    paths: set[tuple[str, ...]] = {
        (by_id[group.parent_id], group.name.lower())
        if group.parent_id else (group.name.lower(),)
        for group in groups
    }
    new_groups: list[list[str]] = []
    entries: list[MaterialEntry | SemiFinishedEntry] = [
        *payload.materials, *payload.semi_finished,
    ]
    for entry in entries:
        for index in range(len(entry.group)):
            key = tuple(part.lower() for part in entry.group[:index + 1])
            if key not in paths:
                paths.add(key)
                new_groups.append(entry.group[:index + 1])
    return ImportPreview(new_groups=new_groups)


@router.post("/operations/import/preview", operation_id="previewOperationsImport")
async def preview_operations(payload: OperationsImport, session: Session) -> ImportPreview:
    groups = list(await session.scalars(select(OperationGroup)))
    names = {group.id: group.name.lower() for group in groups}
    paths: set[tuple[str, ...]] = {
        (names[group.parent_id], group.name.lower()) if group.parent_id
        else (group.name.lower(),) for group in groups
    }
    new_groups = []
    for entry in payload.operations:
        path = [entry.group] if isinstance(entry.group, str) else entry.group or []
        for index in range(len(path)):
            key = tuple(name.lower() for name in path[:index + 1])
            if key not in paths:
                paths.add(key)
                new_groups.append(path[:index + 1])
    return ImportPreview(new_groups=new_groups)


async def stock_group(session: AsyncSession, path: list[str]) -> InventoryGroup | None:
    parent = None
    for name in path:
        group = await session.scalar(
            select(InventoryGroup).where(
                func.lower(InventoryGroup.name) == name.lower(),
                InventoryGroup.parent_id == parent.id
                if parent else InventoryGroup.parent_id.is_(None),
            )
        )
        if group is None:
            group = InventoryGroup(name=name, parent_id=parent.id if parent else None)
            session.add(group)
            await session.flush()
        parent = group
    return parent


async def import_stock(session: AsyncSession, payload: WarehouseImport) -> None:
    await lock_material_catalog(session)
    for entry in payload.materials:
        group = await stock_group(session, entry.group)
        await validate_material_name(session, entry.name, [group.id] if group else [])
        material = Material(name=entry.name, unit=entry.unit, price=entry.price)
        session.add(material)
        await session.flush()
        if group:
            session.add(InventoryGroupMaterial(group_id=group.id, material_id=material.id))
        if entry.initial_quantity:
            await create_movement(
                session, material_id=material.id, movement_type=MovementType.RECEIPT,
                quantity=entry.initial_quantity, comment="Начальный остаток: JSON-импорт",
                source_type="catalog_import",
            )
    for item_entry in [*payload.products, *payload.semi_finished]:
        product_id = None
        if isinstance(item_entry, SemiFinishedEntry):
            product = await session.scalar(select(ManufacturedItem).where(
                func.lower(ManufacturedItem.name) == item_entry.product.lower(),
                ManufacturedItem.is_product.is_(True), ManufacturedItem.archived.is_(False),
            ))
            if product is None:
                raise ConflictError(f'Продукт «{item_entry.product}» не найден')
            product_id = product.id
        item = ManufacturedItem(
            name=item_entry.name, unit=item_entry.unit, product_id=product_id,
            is_product=not isinstance(item_entry, SemiFinishedEntry),
        )
        session.add(item)
        await session.flush()
        if isinstance(item_entry, SemiFinishedEntry):
            group = await stock_group(session, item_entry.group)
            if group:
                session.add(InventoryGroupManufacturedItem(
                    group_id=group.id, manufactured_item_id=item.id,
                ))
        if item_entry.initial_quantity:
            await create_item_movement(
                session, item_id=item.id, movement_type=MovementType.RECEIPT,
                quantity=item_entry.initial_quantity, comment="Начальный остаток: JSON-импорт",
                source_type="catalog_import",
            )


@router.post("/warehouse/import", status_code=201, operation_id="importWarehouseCatalog")
async def import_warehouse(payload: WarehouseImport, session: Session) -> ImportResult:
    try:
        await import_stock(session, payload)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise ConflictError(
            "Название изделия уже существует (возможно, в архиве) "
            "или повторяется в JSON. Ничего не импортировано."
        ) from exc
    except Exception:
        await session.rollback()
        raise
    return ImportResult(
        created=len(payload.materials) + len(payload.products) + len(payload.semi_finished)
    )


@router.post("/operations/import", status_code=201, operation_id="importOperationsCatalog")
async def import_operations(payload: OperationsImport, session: Session) -> ImportResult:
    try:
        await lock_groups(session)
        for entry in payload.operations:
            group: OperationGroup | None = None
            path = [entry.group] if isinstance(entry.group, str) else entry.group or []
            for name in path:
                parent_id = group.id if group else None
                group = await session.scalar(select(OperationGroup).where(
                    func.lower(OperationGroup.name) == name.lower(),
                    OperationGroup.parent_id == parent_id,
                ))
                if group is None:
                    group = OperationGroup(name=name, parent_id=parent_id)
                    session.add(group)
                    await session.flush()
            session.add(Operation(
                name=entry.name, group_id=group.id if group else None,
                time_norm=entry.time_norm, price_per_operation=entry.price_per_operation,
            ))
            await session.flush()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise ConflictError(
            "Название операции уже существует (возможно, в архиве) "
            "или повторяется в JSON. Ничего не импортировано."
        ) from exc
    except Exception:
        await session.rollback()
        raise
    return ImportResult(created=len(payload.operations))
