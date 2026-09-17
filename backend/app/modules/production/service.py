import math
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.modules.inventory import repository as inventory_repository
from app.modules.inventory.model import InventoryMovement
from app.modules.inventory.types import MovementType
from app.modules.manufactured_items import movement_repository
from app.modules.manufactured_items.model import ManufacturedItem, ManufacturedItemMovement
from app.modules.materials.model import Material
from app.modules.payroll.model import WorkEntry
from app.modules.production import repository
from app.modules.production.model import ProductionRecord
from app.modules.production.schemas import (
    ProductionComponentKind,
    ProductionComponentRead,
    ProductionRecordCreate,
    ProductionRecordList,
    ProductionRecordRead,
)
from app.modules.production_plans import repository as plan_repository
from app.modules.production_plans.service import recalculate_active_snapshots
from app.modules.technological_processes import repository as process_repository
from app.modules.technological_processes.model import (
    TechnologicalProcess,
    TechnologicalProcessEdge,
    TechnologicalProcessNode,
    TechnologicalProcessVersion,
)

QUANTITY_STEP = Decimal("0.000001")
ZERO = Decimal("0")


def _quantity(value: Decimal) -> Decimal:
    return value.quantize(QUANTITY_STEP, rounding=ROUND_HALF_UP)


@dataclass(frozen=True, slots=True)
class ComponentDemand:
    kind: ProductionComponentKind
    entity_id: uuid.UUID
    quantity: Decimal


def _topological_order(
    nodes: list[TechnologicalProcessNode], edges: list[TechnologicalProcessEdge]
) -> list[str]:
    node_ids = {node.external_id for node in nodes}
    degree = {node_id: 0 for node_id in node_ids}
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        if edge.source_node_id not in node_ids or edge.target_node_id not in node_ids:
            raise DomainValidationError("The pinned process graph is broken")
        adjacency[edge.source_node_id].append(edge.target_node_id)
        degree[edge.target_node_id] += 1
    queue = deque(sorted(node_id for node_id, value in degree.items() if value == 0))
    order: list[str] = []
    while queue:
        source = queue.popleft()
        order.append(source)
        for target in sorted(adjacency[source]):
            degree[target] -= 1
            if degree[target] == 0:
                queue.append(target)
    if len(order) != len(nodes):
        raise DomainValidationError("The pinned process graph contains a cycle")
    return order


async def _direct_components(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    version: TechnologicalProcessVersion,
    output_quantity: Decimal,
) -> list[ComponentDemand]:
    process = await session.get(TechnologicalProcess, version.process_id)
    if process is None:
        raise DomainValidationError("The process version does not produce this item")
    nodes, edges = await process_repository.get_graph(session, version.id)
    node_map = {node.external_id: node for node in nodes}
    outputs = [
        node
        for node in nodes
        if node.reference_id == item_id and node.node_type in {"output", "manufactured_item"}
    ]
    if len(outputs) != 1 or outputs[0].reference_id != item_id:
        raise DomainValidationError("The pinned process has no valid output")
    incoming: dict[str, list[TechnologicalProcessEdge]] = defaultdict(list)
    for edge in edges:
        incoming[edge.target_node_id].append(edge)
    demand: dict[str, Decimal] = defaultdict(lambda: ZERO)
    demand[outputs[0].external_id] = _quantity(output_quantity)
    totals: dict[tuple[ProductionComponentKind, uuid.UUID], Decimal] = defaultdict(lambda: ZERO)

    for node_id in reversed(_topological_order(nodes, edges)):
        node = node_map[node_id]
        required = _quantity(demand[node_id])
        if required <= 0:
            continue
        if (
            node.node_type in {"material", "manufactured_item"}
            and node_id != outputs[0].external_id
        ):
            if node.reference_id is None:
                raise DomainValidationError("A production component is not mapped")
            kind = ProductionComponentKind(node.node_type)
            key = (kind, node.reference_id)
            totals[key] = _quantity(totals[key] + required)
            continue
        if node.node_type not in {"operation", "output"} and node_id != outputs[0].external_id:
            raise DomainValidationError("The pinned process has an unknown node type")
        for edge in incoming[node_id]:
            if edge.quantity is None or edge.quantity <= 0:
                raise DomainValidationError("A production connection has no positive quantity")
            demand[edge.source_node_id] = _quantity(
                demand[edge.source_node_id] + required * edge.quantity
            )
    return [
        ComponentDemand(kind=kind, entity_id=entity_id, quantity=quantity)
        for (kind, entity_id), quantity in sorted(
            totals.items(), key=lambda value: (value[0][0].value, str(value[0][1]))
        )
    ]


def _same_request(
    record: ProductionRecord,
    *,
    plan_id: uuid.UUID,
    payload: ProductionRecordCreate,
) -> bool:
    return (
        record.production_plan_id == plan_id
        and record.item_id == payload.item_id
        and record.quantity == _quantity(payload.quantity)
        and record.comment == payload.comment
        and record.serial_numbers == payload.serial_numbers
        and record.photo == payload.photo
    )


async def _read(session: AsyncSession, record: ProductionRecord) -> ProductionRecordRead:
    item = await session.get(ManufacturedItem, record.item_id)
    version = await session.get(TechnologicalProcessVersion, record.process_version_id)
    if item is None or version is None:
        raise NotFoundError("Production record references were not found")
    material_rows = (
        await session.execute(
            select(InventoryMovement, Material)
            .join(Material, Material.id == InventoryMovement.material_id)
            .where(
                InventoryMovement.production_record_id == record.id,
                InventoryMovement.quantity < 0,
            )
        )
    ).all()
    manufactured_rows = (
        await session.execute(
            select(ManufacturedItemMovement, ManufacturedItem)
            .join(
                ManufacturedItem,
                ManufacturedItem.id == ManufacturedItemMovement.manufactured_item_id,
            )
            .where(
                ManufacturedItemMovement.production_record_id == record.id,
                ManufacturedItemMovement.quantity < 0,
            )
        )
    ).all()
    output_movement = (
        await session.execute(
            select(ManufacturedItemMovement).where(
                ManufacturedItemMovement.production_record_id == record.id,
                ManufacturedItemMovement.manufactured_item_id == record.item_id,
                ManufacturedItemMovement.quantity > 0,
            )
        )
    ).scalar_one_or_none()
    if output_movement is None:
        raise NotFoundError("Production output movement was not found")
    components = [
        ProductionComponentRead(
            kind=ProductionComponentKind.MATERIAL,
            entity_id=material.id,
            name=material.name,
            unit=material.unit,
            quantity=-movement.quantity,
            movement_id=movement.id,
        )
        for movement, material in material_rows
    ]
    components.extend(
        ProductionComponentRead(
            kind=ProductionComponentKind.MANUFACTURED_ITEM,
            entity_id=component.id,
            name=component.name,
            unit=component.unit,
            quantity=-movement.quantity,
            movement_id=movement.id,
        )
        for movement, component in manufactured_rows
    )
    components.sort(key=lambda component: (component.kind.value, component.name))
    work_entry_ids = list(
        (
            await session.execute(
                select(WorkEntry.id)
                .where(WorkEntry.production_record_id == record.id)
                .order_by(WorkEntry.created_at, WorkEntry.id)
            )
        ).scalars()
    )
    return ProductionRecordRead(
        serial_numbers=record.serial_numbers,
        photo=record.photo,
        id=record.id,
        production_plan_id=record.production_plan_id,
        item_id=item.id,
        item_name=item.name,
        item_unit=item.unit,
        quantity=record.quantity,
        process_version_id=version.id,
        process_version_number=version.version_number,
        idempotency_key=record.idempotency_key,
        created_by=record.created_by,
        comment=record.comment,
        output_movement_id=output_movement.id,
        output_balance_after=output_movement.balance_after,
        components=components,
        work_entry_ids=work_entry_ids,
        created_at=record.created_at,
    )


async def _execute(
    session: AsyncSession,
    *,
    plan_id: uuid.UUID,
    payload: ProductionRecordCreate,
    idempotency_key: str,
    created_by: str,
) -> ProductionRecordRead:
    plan = await plan_repository.get_plan(session, plan_id, for_update=True)
    if plan is None:
        raise NotFoundError("Production plan was not found")
    if plan.status != "active":
        raise ConflictError("Production can only be registered for an active plan")
    item = await session.get(ManufacturedItem, payload.item_id)
    if item is None:
        raise NotFoundError("Produced item was not found")
    if item.archived:
        raise ConflictError("An archived item cannot be produced")

    if item.id == plan.product_id:
        version_id = plan.process_version_id
        available_to_produce = _quantity(plan.planned_quantity - plan.produced_quantity)
    else:
        requirement = await plan_repository.item_requirement(
            session, plan_id=plan.id, item_id=item.id
        )
        if requirement is None or requirement.is_plan_output:
            raise DomainValidationError("The item is not required by this plan")
        if requirement.process_version_id is None:
            raise DomainValidationError("The item requirement has no pinned process")
        version_id = requirement.process_version_id
        available_to_produce = requirement.to_produce_quantity
    quantity = _quantity(payload.quantity)
    if quantity > available_to_produce:
        raise DomainValidationError("Production quantity exceeds the remaining plan requirement")
    version = await session.get(TechnologicalProcessVersion, version_id)
    if version is None:
        raise DomainValidationError("The pinned process version was not found")
    components = await _direct_components(
        session,
        item_id=item.id,
        version=version,
        output_quantity=quantity,
    )

    record = ProductionRecord(
        serial_numbers=payload.serial_numbers,
        photo=payload.photo,
        id=uuid.uuid4(),
        production_plan_id=plan.id,
        item_id=item.id,
        quantity=quantity,
        process_version_id=version.id,
        idempotency_key=idempotency_key,
        created_by=created_by,
        comment=payload.comment,
    )
    await repository.create_record(session, record)
    from app.modules.business.service import register_units

    await register_units(
        session,
        item_id=item.id,
        record_id=record.id,
        quantity=record.quantity,
        serial_numbers=payload.serial_numbers,
        photo=payload.photo,
    )

    material_ids = sorted(
        (
            component.entity_id
            for component in components
            if component.kind == ProductionComponentKind.MATERIAL
        ),
        key=str,
    )
    manufactured_ids = sorted(
        {
            component.entity_id
            for component in components
            if component.kind == ProductionComponentKind.MANUFACTURED_ITEM
        }
        | {item.id},
        key=str,
    )
    if material_ids:
        await session.execute(
            select(Material.id)
            .where(Material.id.in_(material_ids))
            .order_by(Material.id)
            .with_for_update()
        )
    await session.execute(
        select(ManufacturedItem.id)
        .where(ManufacturedItem.id.in_(manufactured_ids))
        .order_by(ManufacturedItem.id)
        .with_for_update()
    )
    movement_comment = f"Production of {item.name}"
    for component in components:
        if component.kind == ProductionComponentKind.MATERIAL:
            await inventory_repository.create_movement(
                session,
                material_id=component.entity_id,
                movement_type=MovementType.CONSUMPTION,
                quantity=-component.quantity,
                comment=movement_comment,
                source_type="production",
                source_id=record.id,
                production_record_id=record.id,
            )
        else:
            await movement_repository.create_movement(
                session,
                item_id=component.entity_id,
                movement_type=MovementType.CONSUMPTION,
                quantity=-component.quantity,
                comment=movement_comment,
                source_type="production",
                source_id=record.id,
                production_record_id=record.id,
            )
    await movement_repository.create_movement(
        session,
        item_id=item.id,
        movement_type=MovementType.PRODUCTION,
        quantity=quantity,
        comment=payload.comment or movement_comment,
        source_type="production",
        source_id=record.id,
        production_record_id=record.id,
    )

    if item.id == plan.product_id:
        plan.produced_quantity = _quantity(plan.produced_quantity + quantity)
        if plan.produced_quantity == plan.planned_quantity:
            plan.status = "completed"
            await plan_repository.clear_requirements(session, [plan.id])
    await recalculate_active_snapshots(session)
    await session.commit()
    await session.refresh(record)
    return await _read(session, record)


async def register(
    session: AsyncSession,
    *,
    plan_id: uuid.UUID,
    payload: ProductionRecordCreate,
    idempotency_key: str,
    created_by: str,
) -> ProductionRecordRead:
    existing = await repository.get_by_idempotency_key(session, idempotency_key)
    if existing is not None:
        if not _same_request(existing, plan_id=plan_id, payload=payload):
            raise ConflictError("Idempotency key was already used for another request")
        return await _read(session, existing)
    try:
        return await _execute(
            session,
            plan_id=plan_id,
            payload=payload,
            idempotency_key=idempotency_key,
            created_by=created_by,
        )
    except IntegrityError as error:
        await session.rollback()
        existing = await repository.get_by_idempotency_key(session, idempotency_key)
        if existing is None:
            raise ConflictError("Production registration conflicted") from error
        if not _same_request(existing, plan_id=plan_id, payload=payload):
            raise ConflictError(
                "Idempotency key was already used for another request"
            ) from error
        return await _read(session, existing)


async def list_for_plan(
    session: AsyncSession,
    *,
    plan_id: uuid.UUID,
    page: int,
    page_size: int,
) -> ProductionRecordList:
    if await plan_repository.get_plan(session, plan_id) is None:
        raise NotFoundError("Production plan was not found")
    records, total = await repository.list_records(
        session, plan_id=plan_id, page=page, page_size=page_size
    )
    return ProductionRecordList(
        items=[await _read(session, record) for record in records],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )
