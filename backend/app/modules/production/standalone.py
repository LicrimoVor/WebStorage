import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.modules.employees.model import Employee
from app.modules.employees.schemas import EmployeeCompensationType
from app.modules.inventory import repository as inventory_repository
from app.modules.inventory.model import InventoryMovement
from app.modules.inventory.types import MovementType
from app.modules.manufactured_items import movement_repository
from app.modules.manufactured_items.model import (
    ManufacturedItem,
    ManufacturedItemMovement,
)
from app.modules.materials.model import Material
from app.modules.operations.model import Operation
from app.modules.payroll.model import WorkEntry
from app.modules.payroll.schemas import WorkCompensationType, WorkInputMode
from app.modules.payroll.service import calculate
from app.modules.production import repository
from app.modules.production.model import ProductionRecord
from app.modules.production.schemas import (
    DirectProductionCreate,
    DirectProductionMaterialRead,
    DirectProductionOperationRead,
    DirectProductionPreviewRead,
    DirectProductionTreeRead,
    ProductionRecordRead,
)
from app.modules.production.service import _quantity, _read, _topological_order
from app.modules.production_plans.service import recalculate_active_snapshots
from app.modules.technological_processes import repository as process_repository
from app.modules.technological_processes.model import (
    TechnologicalProcess,
    TechnologicalProcessEdge,
    TechnologicalProcessNode,
    TechnologicalProcessVersion,
)

ZERO = Decimal("0")


@dataclass(frozen=True, slots=True)
class Recipe:
    version: TechnologicalProcessVersion
    target_node_id: str
    source: str


@dataclass(slots=True)
class RecipeDemand:
    materials: dict[uuid.UUID, Decimal] = field(default_factory=dict)
    items: dict[uuid.UUID, Decimal] = field(default_factory=dict)
    operations: dict[uuid.UUID, Decimal] = field(default_factory=dict)


@dataclass(slots=True)
class MaterialTotal:
    material: Material
    required: Decimal = ZERO
    stock_used: Decimal = ZERO


@dataclass(slots=True)
class OperationTotal:
    operation: Operation
    quantity: Decimal = ZERO


@dataclass(slots=True)
class ItemUse:
    item: ManufacturedItem
    quantity: Decimal
    stock_used: Decimal
    to_produce: Decimal
    production: "ProductionStep | None"


@dataclass(slots=True)
class ProductionStep:
    item: ManufacturedItem
    quantity: Decimal
    recipe: Recipe
    materials: dict[uuid.UUID, Decimal]
    items: list[ItemUse]
    operations: dict[uuid.UUID, Decimal]


@dataclass(slots=True)
class PlanningContext:
    session: AsyncSession
    item_stock: dict[uuid.UUID, Decimal]
    material_stock: dict[uuid.UUID, Decimal]
    materials: dict[uuid.UUID, MaterialTotal] = field(default_factory=dict)
    operations: dict[uuid.UUID, OperationTotal] = field(default_factory=dict)
    item_cache: dict[uuid.UUID, ManufacturedItem] = field(default_factory=dict)
    material_cache: dict[uuid.UUID, Material] = field(default_factory=dict)
    operation_cache: dict[uuid.UUID, Operation] = field(default_factory=dict)

    async def item(self, entity_id: uuid.UUID) -> ManufacturedItem:
        entity = self.item_cache.get(entity_id)
        if entity is None:
            entity = await self.session.get(ManufacturedItem, entity_id)
            if entity is None:
                raise DomainValidationError("A recipe references a missing item")
            if entity.archived:
                raise DomainValidationError(
                    f"Recipe item '{entity.name}' is archived"
                )
            self.item_cache[entity_id] = entity
        return entity

    async def material(self, entity_id: uuid.UUID) -> Material:
        entity = self.material_cache.get(entity_id)
        if entity is None:
            entity = await self.session.get(Material, entity_id)
            if entity is None:
                raise DomainValidationError("A recipe references a missing material")
            if entity.archived:
                raise DomainValidationError(
                    f"Recipe material '{entity.name}' is archived"
                )
            self.material_cache[entity_id] = entity
        return entity

    async def operation(self, entity_id: uuid.UUID) -> Operation:
        entity = self.operation_cache.get(entity_id)
        if entity is None:
            entity = await self.session.get(Operation, entity_id)
            if entity is None:
                raise DomainValidationError("A recipe references a missing operation")
            if entity.archived:
                raise DomainValidationError(
                    f"Recipe operation '{entity.name}' is archived"
                )
            self.operation_cache[entity_id] = entity
        return entity


def _add(target: dict[uuid.UUID, Decimal], key: uuid.UUID, value: Decimal) -> None:
    target[key] = _quantity(target.get(key, ZERO) + value)


async def _output_recipe(
    session: AsyncSession, item: ManufacturedItem
) -> Recipe | None:
    if item.active_process_id is None:
        return None
    version = await session.get(TechnologicalProcessVersion, item.active_process_id)
    if version is None or version.status != "active":
        raise DomainValidationError(
            f"Active technological process for '{item.name}' was not found"
        )
    nodes, _ = await process_repository.get_graph(session, version.id)
    targets = [
        node
        for node in nodes
        if node.node_type == "output" and node.reference_id == item.id
    ]
    if len(targets) != 1:
        raise DomainValidationError(
            f"Active technological process for '{item.name}' has no valid output"
        )
    return Recipe(
        version=version,
        target_node_id=targets[0].external_id,
        source=f"Техпроцесс «{item.name}», версия {version.version_number}",
    )


async def _embedded_recipes(
    session: AsyncSession, item: ManufacturedItem
) -> list[Recipe]:
    output_item = aliased(ManufacturedItem)
    rows = (
        await session.execute(
            select(
                TechnologicalProcessVersion,
                TechnologicalProcessNode,
                TechnologicalProcess.name,
            )
            .join(
                TechnologicalProcess,
                TechnologicalProcess.id == TechnologicalProcessVersion.process_id,
            )
            .join(output_item, output_item.id == TechnologicalProcess.output_item_id)
            .join(
                TechnologicalProcessNode,
                TechnologicalProcessNode.version_id == TechnologicalProcessVersion.id,
            )
            .join(
                TechnologicalProcessEdge,
                (TechnologicalProcessEdge.version_id == TechnologicalProcessVersion.id)
                & (
                    TechnologicalProcessEdge.target_node_id
                    == TechnologicalProcessNode.external_id
                ),
            )
            .where(
                TechnologicalProcessVersion.status == "active",
                TechnologicalProcess.archived.is_(False),
                output_item.is_product.is_(True),
                output_item.archived.is_(False),
                TechnologicalProcessNode.node_type == "manufactured_item",
                TechnologicalProcessNode.reference_id == item.id,
            )
            .distinct()
            .order_by(
                TechnologicalProcessVersion.id,
                TechnologicalProcessNode.external_id,
            )
        )
    ).all()
    return [
        Recipe(
            version=version,
            target_node_id=node.external_id,
            source=f"Поддерево процесса «{process_name}», версия {version.version_number}",
        )
        for version, node, process_name in rows
    ]


async def _recipe_for_item(
    session: AsyncSession, item: ManufacturedItem
) -> Recipe:
    if item.is_product:
        recipe = await _output_recipe(session, item)
        if recipe is None:
            raise DomainValidationError(
                f"Product '{item.name}' has no active technological process"
            )
        return recipe
    embedded = await _embedded_recipes(session, item)
    if len(embedded) > 1:
        raise DomainValidationError(
            f"Several active recipes were found for semi-finished item '{item.name}'"
        )
    if embedded:
        return embedded[0]
    recipe = await _output_recipe(session, item)
    if recipe is None:
        raise DomainValidationError(
            f"Semi-finished item '{item.name}' has no active recipe"
        )
    return recipe


async def _recipe_demand(
    session: AsyncSession, recipe: Recipe, quantity: Decimal
) -> RecipeDemand:
    nodes, edges = await process_repository.get_graph(session, recipe.version.id)
    node_map = {node.external_id: node for node in nodes}
    if recipe.target_node_id not in node_map:
        raise DomainValidationError("The production recipe target was not found")
    incoming: dict[str, list[TechnologicalProcessEdge]] = defaultdict(list)
    for edge in edges:
        incoming[edge.target_node_id].append(edge)
    demand: dict[str, Decimal] = defaultdict(lambda: ZERO)
    demand[recipe.target_node_id] = _quantity(quantity)
    result = RecipeDemand()
    for node_id in reversed(_topological_order(nodes, edges)):
        required = _quantity(demand[node_id])
        if required <= 0:
            continue
        node = node_map[node_id]
        if node_id != recipe.target_node_id and node.node_type in {
            "material",
            "manufactured_item",
        }:
            if node.reference_id is None:
                raise DomainValidationError("A production component is not mapped")
            target = (
                result.materials
                if node.node_type == "material"
                else result.items
            )
            _add(target, node.reference_id, required)
            continue
        if node.node_type == "operation":
            if node.reference_id is None:
                raise DomainValidationError("A production operation is not mapped")
            _add(result.operations, node.reference_id, required)
        for edge in incoming[node_id]:
            if edge.quantity is None or edge.quantity <= 0:
                raise DomainValidationError(
                    "A production connection has no positive quantity"
                )
            demand[edge.source_node_id] = _quantity(
                demand[edge.source_node_id] + required * edge.quantity
            )
    return result


async def _plan_item(
    context: PlanningContext,
    item: ManufacturedItem,
    quantity: Decimal,
    *,
    stack: tuple[uuid.UUID, ...],
) -> ProductionStep:
    if item.id in stack:
        raise DomainValidationError("Manufactured item recipes contain a cycle")
    recipe = await _recipe_for_item(context.session, item)
    demand = await _recipe_demand(context.session, recipe, quantity)
    direct_items: list[ItemUse] = []
    for material_id, required in demand.materials.items():
        material = await context.material(material_id)
        available = context.material_stock.get(material_id, ZERO)
        stock_used = min(available, required)
        context.material_stock[material_id] = _quantity(available - stock_used)
        material_total = context.materials.setdefault(
            material_id, MaterialTotal(material)
        )
        material_total.required = _quantity(material_total.required + required)
        material_total.stock_used = _quantity(
            material_total.stock_used + stock_used
        )
    for operation_id, required in demand.operations.items():
        operation = await context.operation(operation_id)
        operation_total = context.operations.setdefault(
            operation_id, OperationTotal(operation)
        )
        operation_total.quantity = _quantity(operation_total.quantity + required)
    for child_id, required in demand.items.items():
        child_item = await context.item(child_id)
        available = context.item_stock.get(child_id, ZERO)
        stock_used = min(available, required)
        missing = _quantity(required - stock_used)
        context.item_stock[child_id] = _quantity(available - stock_used)
        production = (
            await _plan_item(
                context,
                child_item,
                missing,
                stack=(*stack, item.id),
            )
            if missing > 0
            else None
        )
        direct_items.append(
            ItemUse(
                item=child_item,
                quantity=required,
                stock_used=stock_used,
                to_produce=missing,
                production=production,
            )
        )
    direct_items.sort(key=lambda value: value.item.name)
    return ProductionStep(
        item=item,
        quantity=_quantity(quantity),
        recipe=recipe,
        materials=demand.materials,
        items=direct_items,
        operations=demand.operations,
    )


async def _balances(
    session: AsyncSession,
) -> tuple[dict[uuid.UUID, Decimal], dict[uuid.UUID, Decimal]]:
    item_rows = (
        await session.execute(
            select(
                ManufacturedItemMovement.manufactured_item_id,
                func.coalesce(func.sum(ManufacturedItemMovement.quantity), ZERO),
            ).group_by(ManufacturedItemMovement.manufactured_item_id)
        )
    ).all()
    material_rows = (
        await session.execute(
            select(
                InventoryMovement.material_id,
                func.coalesce(func.sum(InventoryMovement.quantity), ZERO),
            ).group_by(InventoryMovement.material_id)
        )
    ).all()
    return (
        {row[0]: _quantity(Decimal(row[1])) for row in item_rows},
        {row[0]: _quantity(Decimal(row[1])) for row in material_rows},
    )


async def _build_plan(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    quantity: Decimal,
    item_stock: dict[uuid.UUID, Decimal] | None = None,
    material_stock: dict[uuid.UUID, Decimal] | None = None,
) -> tuple[PlanningContext, ProductionStep]:
    item = await session.get(ManufacturedItem, item_id)
    if item is None:
        raise NotFoundError("Manufactured item was not found")
    if item.archived:
        raise ConflictError("An archived item cannot be produced")
    context = PlanningContext(
        session=session,
        item_stock=dict(item_stock or {}),
        material_stock=dict(material_stock or {}),
    )
    context.item_cache[item.id] = item
    root = await _plan_item(context, item, _quantity(quantity), stack=())
    return context, root


def _tree(
    step: ProductionStep,
    *,
    required: Decimal | None = None,
    stock_used: Decimal = ZERO,
) -> DirectProductionTreeRead:
    return DirectProductionTreeRead(
        item_id=step.item.id,
        name=step.item.name,
        unit=step.item.unit,
        required_quantity=required if required is not None else step.quantity,
        stock_used_quantity=stock_used,
        to_produce_quantity=step.quantity,
        process_version_id=step.recipe.version.id,
        process_version_number=step.recipe.version.version_number,
        recipe_source=step.recipe.source,
        children=[
            (
                _tree(
                    child.production,
                    required=child.quantity,
                    stock_used=child.stock_used,
                )
                if child.production is not None
                else DirectProductionTreeRead(
                    item_id=child.item.id,
                    name=child.item.name,
                    unit=child.item.unit,
                    required_quantity=child.quantity,
                    stock_used_quantity=child.stock_used,
                    to_produce_quantity=ZERO,
                    process_version_id=None,
                    process_version_number=None,
                    recipe_source="Взято со склада",  # noqa: RUF001
                )
            )
            for child in step.items
        ],
    )


def _preview(
    context: PlanningContext, root: ProductionStep
) -> DirectProductionPreviewRead:
    materials = [
        DirectProductionMaterialRead(
            material_id=total.material.id,
            name=total.material.name,
            unit=total.material.unit,
            required_quantity=total.required,
            stock_used_quantity=total.stock_used,
            deficit_quantity=_quantity(total.required - total.stock_used),
        )
        for total in sorted(context.materials.values(), key=lambda value: value.material.name)
    ]
    operations = [
        DirectProductionOperationRead(
            operation_id=total.operation.id,
            name=total.operation.name,
            required_quantity=total.quantity,
            required_time_minutes=(
                _quantity(total.quantity * total.operation.time_norm)
                if total.operation.time_norm is not None
                else None
            ),
        )
        for total in sorted(
            context.operations.values(), key=lambda value: value.operation.name
        )
    ]
    return DirectProductionPreviewRead(
        item_id=root.item.id,
        item_name=root.item.name,
        item_unit=root.item.unit,
        quantity=root.quantity,
        can_produce=all(row.deficit_quantity == 0 for row in materials),
        tree=_tree(root),
        materials=materials,
        operations=operations,
    )


async def preview(
    session: AsyncSession, *, item_id: uuid.UUID, quantity: Decimal
) -> DirectProductionPreviewRead:
    item_stock, material_stock = await _balances(session)
    context, root = await _build_plan(
        session,
        item_id=item_id,
        quantity=quantity,
        item_stock=item_stock,
        material_stock=material_stock,
    )
    return _preview(context, root)


async def _execute_step(
    session: AsyncSession,
    *,
    step: ProductionStep,
    record: ProductionRecord,
    comment: str,
) -> None:
    for child in step.items:
        if child.production is not None:
            await _execute_step(
                session,
                step=child.production,
                record=record,
                comment=comment,
            )
    for material_id, required in step.materials.items():
        await inventory_repository.create_movement(
            session,
            material_id=material_id,
            movement_type=MovementType.CONSUMPTION,
            quantity=-required,
            comment=comment,
            source_type="production",
            source_id=record.id,
            production_record_id=record.id,
        )
    for child in step.items:
        await movement_repository.create_movement(
            session,
            item_id=child.item.id,
            movement_type=MovementType.CONSUMPTION,
            quantity=-child.quantity,
            comment=comment,
            source_type="production",
            source_id=record.id,
            production_record_id=record.id,
        )
    await movement_repository.create_movement(
        session,
        item_id=step.item.id,
        movement_type=MovementType.PRODUCTION,
        quantity=step.quantity,
        comment=comment,
        source_type="production",
        source_id=record.id,
        production_record_id=record.id,
    )


async def _record_operations(
    session: AsyncSession,
    *,
    context: PlanningContext,
    payload: DirectProductionCreate,
    record: ProductionRecord,
    created_by: str,
) -> None:
    assignments = {
        assignment.operation_id: assignment.employee_id
        for assignment in payload.operation_assignments
    }
    extra = set(assignments) - set(context.operations)
    if extra:
        raise DomainValidationError("An assignment targets an operation outside the recipe")
    now = datetime.now(UTC)
    for operation_id, total in context.operations.items():
        operation = total.operation
        employee_id = assignments.get(operation_id)
        employee: Employee | None = None
        if employee_id is not None:
            employee = await session.get(Employee, employee_id)
            if employee is None:
                raise NotFoundError("Assigned employee was not found")
            if not employee.active:
                raise DomainValidationError(
                    f"Employee '{employee.full_name}' is inactive"
                )
        if employee is None:
            mode = WorkInputMode.QUANTITY
            input_value = total.quantity
            compensation = WorkCompensationType.ANONYMOUS
            rate = None
        elif employee.compensation_type == EmployeeCompensationType.HOURLY:
            if operation.time_norm is None:
                raise DomainValidationError(
                    f"Operation '{operation.name}' has no time norm for an hourly employee"
                )
            mode = WorkInputMode.TIME
            input_value = _quantity(total.quantity * operation.time_norm)
            compensation = WorkCompensationType.HOURLY
            rate = employee.hourly_rate
        else:
            mode = WorkInputMode.QUANTITY
            input_value = total.quantity
            compensation = WorkCompensationType.PIECEWORK
            rate = operation.price_per_operation
        equivalent, minutes, accrued = calculate(
            input_mode=mode,
            input_value=input_value,
            time_norm=operation.time_norm,
            rate=rate,
            compensation_type=compensation,
        )
        session.add(
            WorkEntry(
                employee_id=employee.id if employee is not None else None,
                operation_id=operation.id,
                input_mode=mode.value,
                compensation_type_snapshot=compensation.value,
                input_value=input_value,
                equivalent_quantity=equivalent,
                time_minutes=minutes,
                time_norm_snapshot=operation.time_norm,
                rate_snapshot=rate,
                accrued_amount=accrued,
                performed_at=now,
                comment=payload.comment,
                created_by=created_by,
                production_record_id=record.id,
            )
        )


async def _same_direct_request(
    session: AsyncSession,
    record: ProductionRecord,
    item_id: uuid.UUID,
    payload: DirectProductionCreate,
) -> bool:
    same_core = (
        record.production_plan_id is None
        and record.item_id == item_id
        and record.quantity == _quantity(payload.quantity)
        and record.comment == payload.comment
        and record.serial_numbers == payload.serial_numbers
        and record.photo == payload.photo
    )
    if not same_core:
        return False
    rows = (
        await session.execute(
            select(WorkEntry.operation_id, WorkEntry.employee_id).where(
                WorkEntry.production_record_id == record.id,
                WorkEntry.employee_id.is_not(None),
            )
        )
    ).all()
    actual: dict[uuid.UUID, uuid.UUID] = {row[0]: row[1] for row in rows if row[1] is not None}
    requested = {
        assignment.operation_id: assignment.employee_id
        for assignment in payload.operation_assignments
        if assignment.employee_id is not None
    }
    return actual == requested


async def _execute(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    payload: DirectProductionCreate,
    idempotency_key: str,
    created_by: str,
) -> ProductionRecordRead:
    # The recursive recipe depends on current intermediate stock. Lock catalogs in
    # a deterministic order before reading balances so another production command
    # cannot turn a stocked leaf into a newly required subtree mid-transaction.
    await session.execute(select(Material.id).order_by(Material.id).with_for_update())
    await session.execute(
        select(ManufacturedItem.id).order_by(ManufacturedItem.id).with_for_update()
    )
    item_stock, material_stock = await _balances(session)
    context, root = await _build_plan(
        session,
        item_id=item_id,
        quantity=payload.quantity,
        item_stock=item_stock,
        material_stock=material_stock,
    )
    overview = _preview(context, root)
    deficits = [row for row in overview.materials if row.deficit_quantity > 0]
    if deficits:
        details = ", ".join(f"{row.name}: {row.deficit_quantity} {row.unit}" for row in deficits)
        raise DomainValidationError(f"Insufficient materials: {details}")
    record = ProductionRecord(
        serial_numbers=payload.serial_numbers,
        photo=payload.photo,
        id=uuid.uuid4(),
        production_plan_id=None,
        item_id=root.item.id,
        quantity=root.quantity,
        process_version_id=root.recipe.version.id,
        idempotency_key=idempotency_key,
        created_by=created_by,
        comment=payload.comment,
    )
    await repository.create_record(session, record)
    from app.modules.business.service import register_units

    await register_units(
        session,
        item_id=root.item.id,
        record_id=record.id,
        quantity=record.quantity,
        serial_numbers=payload.serial_numbers,
        photo=payload.photo,
    )
    comment = payload.comment or f"Производство {root.item.name}"
    await _execute_step(session, step=root, record=record, comment=comment)
    await _record_operations(
        session,
        context=context,
        payload=payload,
        record=record,
        created_by=created_by,
    )
    await session.flush()
    await recalculate_active_snapshots(session)
    await session.commit()
    await session.refresh(record)
    return await _read(session, record)


async def register(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    payload: DirectProductionCreate,
    idempotency_key: str,
    created_by: str,
) -> ProductionRecordRead:
    existing = await repository.get_by_idempotency_key(session, idempotency_key)
    if existing is not None:
        if not await _same_direct_request(session, existing, item_id, payload):
            raise ConflictError("Idempotency key was already used for another request")
        return await _read(session, existing)
    try:
        return await _execute(
            session,
            item_id=item_id,
            payload=payload,
            idempotency_key=idempotency_key,
            created_by=created_by,
        )
    except IntegrityError as error:
        await session.rollback()
        existing = await repository.get_by_idempotency_key(session, idempotency_key)
        if existing is None or not await _same_direct_request(
            session, existing, item_id, payload
        ):
            raise ConflictError("Production registration conflicted") from error
        return await _read(session, existing)
