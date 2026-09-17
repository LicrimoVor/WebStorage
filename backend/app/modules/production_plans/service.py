import math
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.modules.inventory.model import InventoryMovement
from app.modules.manufactured_items.model import (
    ManufacturedItem,
    ManufacturedItemMovement,
)
from app.modules.materials.model import Material
from app.modules.operations.model import Operation
from app.modules.production_plans import repository
from app.modules.production_plans.model import (
    ProductionPlan,
    ProductionPlanItemRequirement,
    ProductionPlanMaterialRequirement,
    ProductionPlanOperationRequirement,
)
from app.modules.production_plans.schemas import (
    PlanItemRequirementRead,
    PlanMaterialRequirementRead,
    PlanOperationRequirementRead,
    ProductionPlanCreate,
    ProductionPlanList,
    ProductionPlanRead,
    ProductionPlanRecalculate,
    ProductionPlanStatus,
    ProductionPlanSummary,
    ProductionPlanUpdate,
)
from app.modules.technological_processes.model import (
    TechnologicalProcess,
    TechnologicalProcessEdge,
    TechnologicalProcessNode,
    TechnologicalProcessVersion,
)

QUANTITY_STEP = Decimal("0.000001")
MONEY_STEP = Decimal("0.01")
ZERO = Decimal("0")


def _quantity(value: Decimal) -> Decimal:
    return value.quantize(QUANTITY_STEP, rounding=ROUND_HALF_UP)


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


@dataclass(slots=True)
class MaterialTotal:
    material: Material
    quantity: Decimal = ZERO


@dataclass(slots=True)
class ItemTotal:
    item: ManufacturedItem
    quantity: Decimal = ZERO
    stock_used: Decimal = ZERO
    to_produce: Decimal = ZERO
    process_version_id: uuid.UUID | None = None
    is_plan_output: bool = False


@dataclass(slots=True)
class OperationTotal:
    operation: Operation
    quantity: Decimal = ZERO


@dataclass(slots=True)
class CalculationContext:
    session: AsyncSession
    item_stock: dict[uuid.UUID, Decimal]
    material_stock: dict[uuid.UUID, Decimal]
    materials: dict[uuid.UUID, MaterialTotal] = field(default_factory=dict)
    items: dict[uuid.UUID, ItemTotal] = field(default_factory=dict)
    operations: dict[uuid.UUID, OperationTotal] = field(default_factory=dict)
    material_cache: dict[uuid.UUID, Material] = field(default_factory=dict)
    item_cache: dict[uuid.UUID, ManufacturedItem] = field(default_factory=dict)
    operation_cache: dict[uuid.UUID, Operation] = field(default_factory=dict)

    async def material(self, entity_id: uuid.UUID) -> Material:
        entity = self.material_cache.get(entity_id)
        if entity is None:
            entity = await self.session.get(Material, entity_id)
            if entity is None:
                raise DomainValidationError("A process references a missing material")
            self.material_cache[entity_id] = entity
        return entity

    async def item(self, entity_id: uuid.UUID) -> ManufacturedItem:
        entity = self.item_cache.get(entity_id)
        if entity is None:
            entity = await self.session.get(ManufacturedItem, entity_id)
            if entity is None:
                raise DomainValidationError("A process references a missing manufactured item")
            self.item_cache[entity_id] = entity
        return entity

    async def operation(self, entity_id: uuid.UUID) -> Operation:
        entity = self.operation_cache.get(entity_id)
        if entity is None:
            entity = await self.session.get(Operation, entity_id)
            if entity is None:
                raise DomainValidationError("A process references a missing operation")
            self.operation_cache[entity_id] = entity
        return entity

    async def add_material(self, entity_id: uuid.UUID, quantity: Decimal) -> None:
        material = await self.material(entity_id)
        total = self.materials.setdefault(entity_id, MaterialTotal(material))
        total.quantity = _quantity(total.quantity + quantity)

    async def add_operation(self, entity_id: uuid.UUID, quantity: Decimal) -> None:
        operation = await self.operation(entity_id)
        total = self.operations.setdefault(entity_id, OperationTotal(operation))
        total.quantity = _quantity(total.quantity + quantity)

    async def add_item(
        self,
        entity_id: uuid.UUID,
        *,
        quantity: Decimal,
        stock_used: Decimal,
        to_produce: Decimal,
        process_version_id: uuid.UUID | None,
        is_plan_output: bool = False,
    ) -> None:
        item = await self.item(entity_id)
        total = self.items.setdefault(entity_id, ItemTotal(item))
        total.quantity = _quantity(total.quantity + quantity)
        total.stock_used = _quantity(total.stock_used + stock_used)
        total.to_produce = _quantity(total.to_produce + to_produce)
        total.process_version_id = total.process_version_id or process_version_id
        total.is_plan_output = total.is_plan_output or is_plan_output


async def _stock_balances(
    session: AsyncSession,
) -> tuple[dict[uuid.UUID, Decimal], dict[uuid.UUID, Decimal]]:
    item_rows = (
        await session.execute(
            select(
                ManufacturedItemMovement.manufactured_item_id,
                func.sum(ManufacturedItemMovement.quantity),
            ).group_by(ManufacturedItemMovement.manufactured_item_id)
        )
    ).all()
    material_rows = (
        await session.execute(
            select(InventoryMovement.material_id, func.sum(InventoryMovement.quantity)).group_by(
                InventoryMovement.material_id
            )
        )
    ).all()
    return (
        {row[0]: _quantity(Decimal(row[1])) for row in item_rows},
        {row[0]: _quantity(Decimal(row[1])) for row in material_rows},
    )


async def _active_version_for_item(
    session: AsyncSession, item: ManufacturedItem
) -> TechnologicalProcessVersion:
    if item.active_process_id is None:
        raise DomainValidationError(
            f"Manufactured item '{item.name}' has no active technological process"
        )
    version = await session.get(TechnologicalProcessVersion, item.active_process_id)
    if version is None:
        raise DomainValidationError(f"Active technological process for '{item.name}' was not found")
    return version


async def _graph(
    session: AsyncSession, version_id: uuid.UUID
) -> tuple[list[TechnologicalProcessNode], list[TechnologicalProcessEdge]]:
    nodes = list(
        (
            await session.execute(
                select(TechnologicalProcessNode).where(
                    TechnologicalProcessNode.version_id == version_id
                )
            )
        )
        .scalars()
        .all()
    )
    edges = list(
        (
            await session.execute(
                select(TechnologicalProcessEdge).where(
                    TechnologicalProcessEdge.version_id == version_id
                )
            )
        )
        .scalars()
        .all()
    )
    return nodes, edges


def _topological_order(
    nodes: list[TechnologicalProcessNode], edges: list[TechnologicalProcessEdge]
) -> list[str]:
    node_ids = {node.external_id for node in nodes}
    degree = {node_id: 0 for node_id in node_ids}
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        if edge.source_node_id not in node_ids or edge.target_node_id not in node_ids:
            raise DomainValidationError("A pinned technological process graph is broken")
        adjacency[edge.source_node_id].append(edge.target_node_id)
        degree[edge.target_node_id] += 1
    queue = deque(sorted(node_id for node_id, value in degree.items() if value == 0))
    result: list[str] = []
    while queue:
        source = queue.popleft()
        result.append(source)
        for target in sorted(adjacency[source]):
            degree[target] -= 1
            if degree[target] == 0:
                queue.append(target)
    if len(result) != len(nodes):
        raise DomainValidationError("A pinned technological process contains a cycle")
    return result


async def _expand_version(
    context: CalculationContext,
    version: TechnologicalProcessVersion,
    quantity: Decimal,
    *,
    item_stack: tuple[uuid.UUID, ...],
    version_overrides: dict[uuid.UUID, uuid.UUID],
) -> None:
    process = await context.session.get(TechnologicalProcess, version.process_id)
    if process is None or process.output_item_id is None:
        raise DomainValidationError("A technological process has no output item")
    if process.output_item_id in item_stack:
        raise DomainValidationError("Manufactured item processes contain a dependency cycle")

    nodes, edges = await _graph(context.session, version.id)
    node_map = {node.external_id: node for node in nodes}
    order = _topological_order(nodes, edges)
    output_nodes = [node for node in nodes if node.node_type == "output"]
    if len(output_nodes) != 1:
        raise DomainValidationError("A process must contain exactly one output node")
    incoming: dict[str, list[TechnologicalProcessEdge]] = defaultdict(list)
    for edge in edges:
        incoming[edge.target_node_id].append(edge)
    demand: dict[str, Decimal] = defaultdict(lambda: ZERO)
    demand[output_nodes[0].external_id] = _quantity(quantity)
    next_stack = (*item_stack, process.output_item_id)

    for node_id in reversed(order):
        node = node_map[node_id]
        required = _quantity(demand[node_id])
        if required <= 0:
            continue
        expansion_quantity = required
        if node.node_type == "material":
            if node.reference_id is None:
                raise DomainValidationError("A material node is not mapped")
            await context.add_material(node.reference_id, required)
        elif node.node_type == "operation":
            if node.reference_id is None:
                raise DomainValidationError("An operation node is not mapped")
            await context.add_operation(node.reference_id, required)
        elif node.node_type == "manufactured_item":
            if node.reference_id is None:
                raise DomainValidationError("A manufactured item node is not mapped")
            item = await context.item(node.reference_id)
            available = context.item_stock.get(item.id, ZERO)
            stock_used = min(available, required)
            to_produce = _quantity(required - stock_used)
            context.item_stock[item.id] = _quantity(available - stock_used)
            own_version: TechnologicalProcessVersion | None = None
            own_version_id = version_overrides.get(item.id, item.active_process_id)
            if own_version_id is not None:
                own_version = await context.session.get(TechnologicalProcessVersion, own_version_id)
            await context.add_item(
                item.id,
                quantity=required,
                stock_used=stock_used,
                to_produce=to_produce,
                process_version_id=version.id
                if incoming[node_id]
                else own_version.id
                if own_version
                else None,
            )
            expansion_quantity = to_produce
            if not incoming[node_id] and to_produce > 0:
                if own_version is None:
                    raise DomainValidationError(
                        f"Manufactured item '{item.name}' has no active process"
                    )
                await _expand_version(
                    context,
                    own_version,
                    to_produce,
                    item_stack=next_stack,
                    version_overrides=version_overrides,
                )
                expansion_quantity = ZERO
        elif node.node_type != "output":
            raise DomainValidationError("A process contains an unknown node type")

        for edge in incoming[node_id]:
            if edge.quantity is None or edge.quantity <= 0:
                raise DomainValidationError("A process connection has no positive quantity")
            demand[edge.source_node_id] = _quantity(
                demand[edge.source_node_id] + expansion_quantity * edge.quantity
            )


async def _calculate_plan(
    session: AsyncSession,
    plan: ProductionPlan,
    *,
    item_stock: dict[uuid.UUID, Decimal],
    material_stock: dict[uuid.UUID, Decimal],
    version_overrides: dict[uuid.UUID, uuid.UUID],
) -> None:
    product = await session.get(ManufacturedItem, plan.product_id)
    version = await session.get(TechnologicalProcessVersion, plan.process_version_id)
    if product is None or version is None:
        raise DomainValidationError("Plan product or process version was not found")
    remaining = _quantity(plan.planned_quantity - plan.produced_quantity)
    context = CalculationContext(session, item_stock, material_stock)
    await context.add_item(
        product.id,
        quantity=remaining,
        stock_used=ZERO,
        to_produce=remaining,
        process_version_id=version.id,
        is_plan_output=True,
    )
    if remaining > 0:
        await _expand_version(
            context,
            version,
            remaining,
            item_stack=(),
            version_overrides=version_overrides,
        )

    missing: list[str] = []
    estimated_cost = ZERO
    total_time = ZERO
    entities: list[object] = []
    for total in sorted(context.materials.values(), key=lambda value: value.material.name):
        available = context.material_stock.get(total.material.id, ZERO)
        stock_used = min(available, total.quantity)
        deficit = _quantity(total.quantity - stock_used)
        context.material_stock[total.material.id] = _quantity(available - stock_used)
        cost = None
        if total.material.price is None:
            missing.append(
                "\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u0430 "
                "\u0446\u0435\u043d\u0430 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0430 "
                f"«{total.material.name}»"
            )
        else:
            cost = _money(total.quantity * total.material.price)
            estimated_cost += cost
        entities.append(
            ProductionPlanMaterialRequirement(
                plan_id=plan.id,
                material_id=total.material.id,
                name_snapshot=total.material.name,
                unit_snapshot=total.material.unit,
                required_quantity=total.quantity,
                stock_used_quantity=stock_used,
                deficit_quantity=deficit,
                unit_price_snapshot=total.material.price,
                cost=cost,
            )
        )
    for item_total in sorted(context.items.values(), key=lambda value: value.item.name):
        entities.append(
            ProductionPlanItemRequirement(
                plan_id=plan.id,
                manufactured_item_id=item_total.item.id,
                process_version_id=item_total.process_version_id,
                name_snapshot=item_total.item.name,
                unit_snapshot=item_total.item.unit,
                required_quantity=item_total.quantity,
                stock_used_quantity=item_total.stock_used,
                to_produce_quantity=item_total.to_produce,
                is_plan_output=item_total.is_plan_output,
            )
        )
    time_complete = True
    for operation_total in sorted(
        context.operations.values(), key=lambda value: value.operation.name
    ):
        operation = operation_total.operation
        required_time = None
        if operation.time_norm is None:
            time_complete = False
            missing.append(
                "\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u0430 "
                "\u043d\u043e\u0440\u043c\u0430 \u0432\u0440\u0435\u043c\u0435\u043d\u0438 "
                "\u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438 "
                f"«{operation.name}»"
            )
        else:
            required_time = _quantity(operation_total.quantity * operation.time_norm)
            total_time += required_time
        cost = None
        if operation.price_per_operation is None:
            missing.append(
                "\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u0430 "
                "\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c "
                "\u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438 "
                f"«{operation.name}»"
            )
        else:
            cost = _money(operation_total.quantity * operation.price_per_operation)
            estimated_cost += cost
        entities.append(
            ProductionPlanOperationRequirement(
                plan_id=plan.id,
                operation_id=operation.id,
                name_snapshot=operation.name,
                required_quantity=operation_total.quantity,
                time_norm_snapshot=operation.time_norm,
                required_time_minutes=required_time,
                price_snapshot=operation.price_per_operation,
                cost=cost,
            )
        )
    plan.missing_data = missing
    plan.calculation_complete = not missing
    plan.total_required_time_minutes = _quantity(total_time) if time_complete else None
    plan.estimated_cost = _money(estimated_cost) if not missing else None
    session.add_all(entities)
    await session.flush()


async def _recalculate_active(session: AsyncSession) -> None:
    plans = await repository.active_plans_for_update(session)
    version_overrides: dict[uuid.UUID, dict[uuid.UUID, uuid.UUID]] = {}
    for plan in plans:
        _, item_rows, _ = await repository.requirements(session, plan.id)
        version_overrides[plan.id] = {
            row.manufactured_item_id: row.process_version_id
            for row in item_rows
            if not row.is_plan_output and row.process_version_id is not None
        }
    await repository.clear_requirements(session, [plan.id for plan in plans])
    item_stock, material_stock = await _stock_balances(session)
    for plan in plans:
        await _calculate_plan(
            session,
            plan,
            item_stock=item_stock,
            material_stock=material_stock,
            version_overrides=version_overrides[plan.id],
        )


async def recalculate_active_snapshots(session: AsyncSession) -> None:
    """Refresh open plan snapshots inside the caller's transaction."""
    await _recalculate_active(session)


async def _recalculate_one(
    session: AsyncSession, plan: ProductionPlan, *, preserve_pins: bool = True
) -> None:
    version_overrides: dict[uuid.UUID, uuid.UUID] = {}
    if preserve_pins:
        _, item_rows, _ = await repository.requirements(session, plan.id)
        version_overrides = {
            row.manufactured_item_id: row.process_version_id
            for row in item_rows
            if not row.is_plan_output and row.process_version_id is not None
        }
    await repository.clear_requirements(session, [plan.id])
    item_stock, material_stock = await _stock_balances(session)
    await _calculate_plan(
        session,
        plan,
        item_stock=item_stock,
        material_stock=material_stock,
        version_overrides=version_overrides,
    )


async def _read(session: AsyncSession, plan: ProductionPlan) -> ProductionPlanRead:
    product = await session.get(ManufacturedItem, plan.product_id)
    version = await session.get(TechnologicalProcessVersion, plan.process_version_id)
    if product is None or version is None:  # protected by foreign keys
        raise NotFoundError("Plan references were not found")
    materials, items, operations = await repository.requirements(session, plan.id)
    total_minutes = plan.total_required_time_minutes
    return ProductionPlanRead(
        id=plan.id,
        product_id=product.id,
        product_name=product.name,
        product_unit=product.unit,
        process_version_id=version.id,
        process_version_number=version.version_number,
        planned_quantity=plan.planned_quantity,
        produced_quantity=plan.produced_quantity,
        remaining_quantity=_quantity(plan.planned_quantity - plan.produced_quantity),
        status=ProductionPlanStatus(plan.status),
        target_date=plan.target_date,
        created_by=plan.created_by,
        calculation_complete=plan.calculation_complete,
        missing_data=list(plan.missing_data),
        total_required_time_minutes=total_minutes,
        total_required_hours=(
            _quantity(total_minutes / Decimal("60")) if total_minutes is not None else None
        ),
        estimated_cost=plan.estimated_cost,
        materials=[
            PlanMaterialRequirementRead(
                material_id=row.material_id,
                name=row.name_snapshot,
                unit=row.unit_snapshot,
                required_quantity=row.required_quantity,
                stock_used_quantity=row.stock_used_quantity,
                deficit_quantity=row.deficit_quantity,
                unit_price=row.unit_price_snapshot,
                cost=row.cost,
            )
            for row in materials
        ],
        manufactured_items=[
            PlanItemRequirementRead(
                manufactured_item_id=row.manufactured_item_id,
                process_version_id=row.process_version_id,
                name=row.name_snapshot,
                unit=row.unit_snapshot,
                required_quantity=row.required_quantity,
                stock_used_quantity=row.stock_used_quantity,
                to_produce_quantity=row.to_produce_quantity,
                is_plan_output=row.is_plan_output,
            )
            for row in items
        ],
        operations=[
            PlanOperationRequirementRead(
                operation_id=row.operation_id,
                name=row.name_snapshot,
                required_quantity=row.required_quantity,
                time_norm=row.time_norm_snapshot,
                required_time_minutes=row.required_time_minutes,
                price=row.price_snapshot,
                cost=row.cost,
            )
            for row in operations
        ],
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


async def create(
    session: AsyncSession, payload: ProductionPlanCreate, *, created_by: str
) -> ProductionPlanRead:
    product = await session.get(ManufacturedItem, payload.product_id)
    if product is None:
        raise NotFoundError("Product was not found")
    if product.archived or not product.is_product:
        raise DomainValidationError("A production plan can only be created for a product")
    version = await _active_version_for_item(session, product)
    plan = ProductionPlan(
        product_id=product.id,
        process_version_id=version.id,
        planned_quantity=_quantity(payload.planned_quantity),
        produced_quantity=ZERO,
        status=payload.status.value,
        target_date=payload.target_date,
        created_by=created_by,
    )
    session.add(plan)
    await session.flush()
    if plan.status == ProductionPlanStatus.ACTIVE.value:
        await _recalculate_active(session)
    else:
        await _recalculate_one(session, plan)
    await session.commit()
    await session.refresh(plan)
    return await _read(session, plan)


async def list_all(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    status: ProductionPlanStatus | None,
) -> ProductionPlanList:
    plans, total = await repository.list_plans(
        session,
        page=page,
        page_size=page_size,
        status=status.value if status is not None else None,
    )
    return ProductionPlanList(
        items=[await _read(session, plan) for plan in plans],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def get(session: AsyncSession, plan_id: uuid.UUID) -> ProductionPlanRead:
    plan = await repository.get_plan(session, plan_id)
    if plan is None:
        raise NotFoundError("Production plan was not found")
    return await _read(session, plan)


async def update(
    session: AsyncSession, plan_id: uuid.UUID, payload: ProductionPlanUpdate
) -> ProductionPlanRead:
    plan = await repository.get_plan(session, plan_id, for_update=True)
    if plan is None:
        raise NotFoundError("Production plan was not found")
    if plan.status in {
        ProductionPlanStatus.COMPLETED.value,
        ProductionPlanStatus.CANCELLED.value,
    }:
        raise ConflictError("A completed or cancelled production plan cannot be changed")
    changes = payload.model_dump(exclude_unset=True)
    for name, value in changes.items():
        if name == "status" and value is not None:
            value = value.value
        setattr(plan, name, value)
    if plan.produced_quantity > plan.planned_quantity:
        raise DomainValidationError("Produced quantity cannot exceed planned quantity")
    if plan.status == ProductionPlanStatus.COMPLETED.value:
        plan.produced_quantity = plan.planned_quantity
    if plan.status == ProductionPlanStatus.ACTIVE.value:
        await _recalculate_active(session)
    elif plan.status == ProductionPlanStatus.DRAFT.value:
        await _recalculate_one(session, plan)
    else:
        await _recalculate_active(session)
    await session.commit()
    await session.refresh(plan)
    return await _read(session, plan)


async def recalculate(
    session: AsyncSession,
    plan_id: uuid.UUID,
    payload: ProductionPlanRecalculate,
) -> ProductionPlanRead:
    plan = await repository.get_plan(session, plan_id, for_update=True)
    if plan is None:
        raise NotFoundError("Production plan was not found")
    if plan.status not in {
        ProductionPlanStatus.DRAFT.value,
        ProductionPlanStatus.ACTIVE.value,
    }:
        raise ConflictError("Only an open production plan can be recalculated")
    if payload.use_latest_process_version:
        product = await session.get(ManufacturedItem, plan.product_id)
        if product is None:
            raise NotFoundError("Plan product was not found")
        plan.process_version_id = (await _active_version_for_item(session, product)).id
        await repository.clear_requirements(session, [plan.id])
    if plan.status == ProductionPlanStatus.ACTIVE.value:
        await _recalculate_active(session)
    else:
        await _recalculate_one(
            session, plan, preserve_pins=not payload.use_latest_process_version
        )
    await session.commit()
    await session.refresh(plan)
    return await _read(session, plan)


async def summary(session: AsyncSession) -> ProductionPlanSummary:
    plans = await repository.active_plans(session)
    reads = [await _read(session, plan) for plan in plans]
    material_ids = {requirement.material_id for plan in reads for requirement in plan.materials}
    deficit_ids = {
        requirement.material_id
        for plan in reads
        for requirement in plan.materials
        if requirement.deficit_quantity > 0
    }
    time_complete = all(plan.total_required_hours is not None for plan in reads)
    cost_complete = all(plan.estimated_cost is not None for plan in reads)
    return ProductionPlanSummary(
        active_plans=len(reads),
        products_to_produce=_quantity(sum((plan.remaining_quantity for plan in reads), start=ZERO)),
        material_positions=len(material_ids),
        material_deficit_positions=len(deficit_ids),
        total_required_hours=(
            _quantity(sum((plan.total_required_hours or ZERO for plan in reads), start=ZERO))
            if time_complete
            else None
        ),
        estimated_cost=(
            _money(sum((plan.estimated_cost or ZERO for plan in reads), start=ZERO))
            if cost_complete
            else None
        ),
        calculation_complete=all(plan.calculation_complete for plan in reads),
    )
