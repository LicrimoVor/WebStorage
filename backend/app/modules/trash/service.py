import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.modules.business.model import FundingSource
from app.modules.employees.model import Employee
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.materials.model import Material
from app.modules.operation_instructions.model import OperationInstructionAsset
from app.modules.operations.model import Operation, OperationGroup
from app.modules.production_plans.model import ProductionPlan
from app.modules.technological_processes.model import (
    TechnologicalProcess,
    TechnologicalProcessVersion,
)
from app.modules.trash.model import TrashEntry
from app.modules.warehouse.model import (
    InventoryGroup,
    InventoryGroupManufacturedItem,
    InventoryGroupMaterial,
)

CATALOG_MODELS: dict[str, Any] = {
    "material": Material,
    "manufactured_item": ManufacturedItem,
    "operation": Operation,
    "employee": Employee,
    "process": TechnologicalProcess,
    "funding_source": FundingSource,
    "instruction_asset": OperationInstructionAsset,
    "production_plan": ProductionPlan,
}


async def move_to_trash(
    session: AsyncSession,
    kind: str,
    entity_id: uuid.UUID,
    actor: str,
    *,
    hide_process: bool = True,
) -> TrashEntry:
    # Serialize delete/restore, including deletes reached through legacy archive routes.
    await session.execute(text("SELECT pg_advisory_xact_lock(70261005)"))
    existing = await session.scalar(
        select(TrashEntry).where(
            TrashEntry.entity_type == kind,
            TrashEntry.entity_id == entity_id,
            TrashEntry.restored_at.is_(None),
        )
    )
    if existing:
        if kind == "process" and hide_process:
            process = await session.get(TechnologicalProcess, entity_id, with_for_update=True)
            if process is not None and process.deleted_at is None:
                process.deleted_at = datetime.now(UTC)
        return existing
    state: dict[str, Any] = {}
    if kind == "finance_entry":
        from app.modules.business.model import BusinessDocument
        from app.modules.finance.editing import snapshot
        from app.modules.finance.model import FinancialTransaction
        from app.modules.inventory.model import InventoryMovement
        from app.modules.payroll.model import EmployeePayment
        from app.modules.sales.model import Sale

        for finance_model in (
            FinancialTransaction,
            Sale,
            EmployeePayment,
            InventoryMovement,
            BusinessDocument,
        ):
            if await session.get(finance_model, entity_id, with_for_update=True) is not None:
                break

        before = await snapshot(session, entity_id)
        name = str(before["description"])
        state = {"entry": before}
    elif kind == "process_version":
        version = await session.get(TechnologicalProcessVersion, entity_id)
        if version is None or version.deleted_at is not None:
            raise NotFoundError("Версия не найдена")
        process = await session.get(TechnologicalProcess, version.process_id, with_for_update=True)
        if process is None or process.deleted_at is not None:
            raise NotFoundError("Техпроцесс не найден")
        # The process lock also serializes version creation and activation.
        await session.refresh(version, with_for_update=True)
        if version.status == "active":
            raise ConflictError("Сначала деактивируйте версию")
        remaining = list(
            await session.scalars(
                select(TechnologicalProcessVersion.id).where(
                    TechnologicalProcessVersion.process_id == process.id,
                    TechnologicalProcessVersion.deleted_at.is_(None),
                )
            )
        )
        if len(remaining) <= 1:
            raise ConflictError("Последнюю версию нельзя удалить. Удалите техпроцесс целиком.")
        name = f"{process.name} · v{version.version_number}"
        version.deleted_at = datetime.now(UTC)
    elif kind == "operation_group":
        from app.modules.operations.groups import lock_groups

        await lock_groups(session)
        operation_group = await session.get(OperationGroup, entity_id, with_for_update=True)
        if operation_group is None:
            raise NotFoundError("Группа не найдена")
        if await session.scalar(
            select(OperationGroup.id).where(OperationGroup.parent_id == entity_id)
        ):
            raise ConflictError("Сначала удалите или перенесите подгруппы")
        name = operation_group.name
        state = {
            "name": name,
            "parent_id": str(operation_group.parent_id) if operation_group.parent_id else None,
            "operations": [
                str(v)
                for v in await session.scalars(
                    select(Operation.id).where(Operation.group_id == entity_id),
                )
            ],
        }
        await session.delete(operation_group)
        await session.flush()
    elif kind == "inventory_group":
        group = await session.get(InventoryGroup, entity_id, with_for_update=True)
        if group is None:
            raise NotFoundError("Группа не найдена")
        if await session.scalar(
            select(InventoryGroup.id).where(
                InventoryGroup.parent_id == entity_id,
            )
        ):
            raise ConflictError("Сначала удалите подгруппы")
        name = group.name
        state = {
            "name": group.name,
            "parent_id": str(group.parent_id) if group.parent_id else None,
            "materials": [
                str(v)
                for v in await session.scalars(
                    select(
                        InventoryGroupMaterial.material_id,
                    ).where(InventoryGroupMaterial.group_id == entity_id)
                )
            ],
            "items": [
                str(v)
                for v in await session.scalars(
                    select(
                        InventoryGroupManufacturedItem.manufactured_item_id,
                    ).where(InventoryGroupManufacturedItem.group_id == entity_id)
                )
            ],
        }
        state["processes"] = [
            str(v)
            for v in await session.scalars(
                select(TechnologicalProcess.id).where(
                    TechnologicalProcess.default_group_id == entity_id
                )
            )
        ]
        # Use the existing validation, but commit only together with the trash record.
        from app.modules.warehouse.service import delete_group

        await delete_group(session, entity_id, commit=False)
    else:
        model = CATALOG_MODELS.get(kind)
        if model is None:
            raise NotFoundError("Тип записи не найден")
        target = await session.get(model, entity_id, with_for_update=True)
        if target is None:
            raise NotFoundError("Запись не найдена")
        name = (
            getattr(target, "name", None)
            or getattr(target, "full_name", None)
            or getattr(target, "filename", None)
            or f"План {entity_id}"
        )
        if kind == "instruction_asset":
            target.deleted_at = datetime.now(UTC)
        elif kind == "employee":
            state["active"] = target.active
            target.active = False
        elif kind == "production_plan":
            from app.modules.production_plans.service import recalculate_active_snapshots

            state["status"] = target.status
            target.status = "cancelled"
            await session.flush()
            await recalculate_active_snapshots(session)
        else:
            state["archived"] = target.archived
            target.archived = True
        if kind == "process":
            from app.modules.technological_processes.repository import archive_process

            versions = await session.scalars(
                select(TechnologicalProcessVersion).where(
                    TechnologicalProcessVersion.process_id == entity_id,
                )
            )
            state["versions"] = {str(v.id): v.status for v in versions}
            await archive_process(session, target)
            target.deleted_at = datetime.now(UTC) if hide_process else None
    entry = TrashEntry(
        entity_type=kind, entity_id=entity_id, name=name, state=state, deleted_by=actor
    )
    session.add(entry)
    await session.flush()
    return entry


async def restore(session: AsyncSession, entry_id: uuid.UUID, actor: str) -> None:
    await session.execute(text("SELECT pg_advisory_xact_lock(70261005)"))
    from app.modules.materials.uniqueness import lock_material_catalog

    await lock_material_catalog(session)
    entry = await session.get(TrashEntry, entry_id, with_for_update=True)
    if entry is None or entry.restored_at is not None or entry.purged_at is not None:
        raise NotFoundError("Запись в корзине не найдена")
    kind = entry.entity_type
    try:
        if kind == "operation_group":
            from app.modules.operations.groups import lock_groups

            await lock_groups(session)
            state = entry.state
            parent_id = uuid.UUID(state["parent_id"]) if state.get("parent_id") else None
            if parent_id and await session.get(OperationGroup, parent_id) is None:
                raise ConflictError("Сначала восстановите родительскую группу")
            session.add(OperationGroup(id=entry.entity_id, name=state["name"], parent_id=parent_id))
            await session.flush()
            for operation_id in state.get("operations", []):
                operation = await session.get(
                    Operation, uuid.UUID(operation_id), with_for_update=True
                )
                if operation is not None:
                    if operation.group_id is not None:
                        raise ConflictError("Операция уже перенесена в другую группу")
                    operation.group_id = entry.entity_id
        elif kind == "inventory_group":
            state = entry.state
            parent_id = uuid.UUID(state["parent_id"]) if state.get("parent_id") else None
            if parent_id and await session.get(InventoryGroup, parent_id) is None:
                raise ConflictError("Сначала восстановите родительскую группу")
            session.add(InventoryGroup(id=entry.entity_id, name=state["name"], parent_id=parent_id))
            await session.flush()
            session.add_all(
                [
                    InventoryGroupMaterial(group_id=entry.entity_id, material_id=uuid.UUID(v))
                    for v in state.get("materials", [])
                ]
            )
            await session.flush()
            from app.modules.materials.uniqueness import validate_material_name
            from app.modules.warehouse.repository import material_group_map

            material_ids = [uuid.UUID(v) for v in state.get("materials", [])]
            groups = await material_group_map(session, material_ids)
            for material_id in material_ids:
                material = await session.get(Material, material_id)
                if material is not None:
                    await validate_material_name(
                        session,
                        material.name,
                        [g.id for g in groups.get(material_id, [])],
                        material_id,
                    )
            session.add_all(
                [
                    InventoryGroupManufacturedItem(
                        group_id=entry.entity_id,
                        manufactured_item_id=uuid.UUID(v),
                    )
                    for v in state.get("items", [])
                ]
            )
            for process_id in state.get("processes", []):
                process = await session.get(
                    TechnologicalProcess, uuid.UUID(process_id), with_for_update=True
                )
                if process is not None and process.default_group_id is None:
                    process.default_group_id = entry.entity_id
        elif kind == "process_version":
            version = await session.get(TechnologicalProcessVersion, entry.entity_id)
            if version is None:
                raise NotFoundError("Версия не найдена")
            process = await session.get(
                TechnologicalProcess, version.process_id, with_for_update=True
            )
            if process is None or process.deleted_at is not None:
                raise ConflictError("Сначала восстановите техпроцесс")
            await session.refresh(version, with_for_update=True)
            version.deleted_at = None
        elif kind != "finance_entry":
            target = await session.get(CATALOG_MODELS[kind], entry.entity_id, with_for_update=True)
            if target is None:
                raise NotFoundError("Исходная запись не найдена")
            if kind == "instruction_asset":
                target.deleted_at = None
            elif kind == "employee":
                target.active = bool(entry.state.get("active", True))
            elif kind == "production_plan":
                target.status = entry.state["status"]
            else:
                target.archived = bool(entry.state.get("archived", False))
            if kind == "material" and not target.archived:
                from app.modules.materials.uniqueness import validate_material_name
                from app.modules.warehouse.repository import material_group_map

                groups = await material_group_map(session, [target.id])
                await validate_material_name(
                    session, target.name, [g.id for g in groups.get(target.id, [])], target.id
                )
            if kind == "process":
                target.deleted_at = None
                versions = await session.scalars(
                    select(TechnologicalProcessVersion).where(
                        TechnologicalProcessVersion.process_id == target.id,
                    )
                )
                active_version_id = None
                for version in versions:
                    version.status = entry.state.get("versions", {}).get(
                        str(version.id), version.status
                    )
                    if version.status == "active":
                        active_version_id = version.id
                        from app.modules.technological_processes.repository import get_graph
                        from app.modules.technological_processes.service import _activation_errors

                        nodes, edges = await get_graph(session, version.id)
                        errors = await _activation_errors(session, target, nodes, edges)
                        if errors:
                            raise ConflictError(
                                "Сначала восстановите компоненты техпроцесса или устраните "
                                "конфликт рецептов: " + "; ".join(errors)
                            )
                if active_version_id and target.output_item_id:
                    item = await session.get(
                        ManufacturedItem, target.output_item_id, with_for_update=True
                    )
                    if item and item.active_process_id not in (None, active_version_id):
                        raise ConflictError("Для позиции уже выбран другой техпроцесс")
                    if item:
                        item.active_process_id = active_version_id
        entry.restored_at = datetime.now(UTC)
        entry.restored_by = actor
        if kind == "production_plan":
            from app.modules.production_plans.service import recalculate_active_snapshots

            await session.flush()
            await recalculate_active_snapshots(session)
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError(
            "Восстановление невозможно: имя уже используется или связь занята"
        ) from error


async def purge(session: AsyncSession, entry_id: uuid.UUID) -> None:
    # Keep the tombstone: financial totals exclude records through this entry.
    await session.execute(text("SELECT pg_advisory_xact_lock(70261005)"))
    entry = await session.get(TrashEntry, entry_id, with_for_update=True)
    if entry is None or entry.restored_at is not None or entry.purged_at is not None:
        raise NotFoundError("Запись в корзине не найдена")
    entry.purged_at = datetime.now(UTC)
    entry.state = {}
    await session.commit()
