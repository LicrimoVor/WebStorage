import uuid

from sqlalchemy import asc, delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.query import SortOrder
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.materials.model import Material
from app.modules.operations.model import Operation
from app.modules.technological_processes.model import (
    TechnologicalProcess,
    TechnologicalProcessEdge,
    TechnologicalProcessNode,
    TechnologicalProcessVersion,
)
from app.modules.technological_processes.schemas import ProcessSortField

ProcessBundle = tuple[
    TechnologicalProcess,
    str | None,
    TechnologicalProcessVersion | None,
    TechnologicalProcessVersion,
]


async def create_process(
    session: AsyncSession, process: TechnologicalProcess
) -> TechnologicalProcess:
    session.add(process)
    await session.flush()
    return process


async def create_version(
    session: AsyncSession, version: TechnologicalProcessVersion
) -> TechnologicalProcessVersion:
    session.add(version)
    await session.flush()
    return version


async def add_graph(
    session: AsyncSession,
    *,
    nodes: list[TechnologicalProcessNode],
    edges: list[TechnologicalProcessEdge],
) -> None:
    session.add_all([*nodes, *edges])
    await session.flush()


async def replace_graph(
    session: AsyncSession,
    *,
    version_id: uuid.UUID,
    nodes: list[TechnologicalProcessNode],
    edges: list[TechnologicalProcessEdge],
) -> None:
    await session.execute(
        delete(TechnologicalProcessEdge).where(TechnologicalProcessEdge.version_id == version_id)
    )
    await session.execute(
        delete(TechnologicalProcessNode).where(TechnologicalProcessNode.version_id == version_id)
    )
    await session.flush()
    await add_graph(session, nodes=nodes, edges=edges)


async def get_graph(
    session: AsyncSession, version_id: uuid.UUID
) -> tuple[list[TechnologicalProcessNode], list[TechnologicalProcessEdge]]:
    nodes = list(
        (
            await session.execute(
                select(TechnologicalProcessNode)
                .where(TechnologicalProcessNode.version_id == version_id)
                .order_by(asc(TechnologicalProcessNode.external_id))
            )
        )
        .scalars()
        .all()
    )
    edges = list(
        (
            await session.execute(
                select(TechnologicalProcessEdge)
                .where(TechnologicalProcessEdge.version_id == version_id)
                .order_by(asc(TechnologicalProcessEdge.external_id))
            )
        )
        .scalars()
        .all()
    )
    return nodes, edges


async def list_processes(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    include_archived: bool,
    sort_by: ProcessSortField,
    sort_order: SortOrder,
) -> tuple[list[ProcessBundle], int]:
    statement = select(TechnologicalProcess, ManufacturedItem.name).outerjoin(
        ManufacturedItem,
        ManufacturedItem.id == TechnologicalProcess.output_item_id,
    )
    if not include_archived:
        statement = statement.where(TechnologicalProcess.archived.is_(False))
    if search:
        search_value = f"%{search.strip()}%"
        statement = statement.where(
            TechnologicalProcess.name.ilike(search_value)
            | ManufacturedItem.name.ilike(search_value)
        )
    total = int(
        (
            await session.execute(
                select(func.count()).select_from(statement.order_by(None).subquery())
            )
        ).scalar_one()
    )
    order_columns = {
        ProcessSortField.NAME: func.lower(TechnologicalProcess.name),
        ProcessSortField.UPDATED_AT: TechnologicalProcess.updated_at,
        ProcessSortField.CREATED_AT: TechnologicalProcess.created_at,
    }
    direction = asc if sort_order == SortOrder.ASC else desc
    statement = statement.order_by(direction(order_columns[sort_by]), asc(TechnologicalProcess.id))
    statement = statement.offset((page - 1) * page_size).limit(page_size)
    rows = (await session.execute(statement)).all()
    process_ids = [row[0].id for row in rows]
    versions_by_process = await _versions_by_process(session, process_ids)
    bundles: list[ProcessBundle] = []
    for process, output_name in rows:
        versions = versions_by_process[process.id]
        active = next((item for item in versions if item.status == "active"), None)
        bundles.append((process, output_name, active, versions[0]))
    return bundles, total


async def _versions_by_process(
    session: AsyncSession, process_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[TechnologicalProcessVersion]]:
    result: dict[uuid.UUID, list[TechnologicalProcessVersion]] = {
        process_id: [] for process_id in process_ids
    }
    if not process_ids:
        return result
    versions = (
        (
            await session.execute(
                select(TechnologicalProcessVersion)
                .where(TechnologicalProcessVersion.process_id.in_(process_ids))
                .order_by(desc(TechnologicalProcessVersion.version_number))
            )
        )
        .scalars()
        .all()
    )
    for version in versions:
        result[version.process_id].append(version)
    return result


async def get_process_bundle(session: AsyncSession, process_id: uuid.UUID) -> ProcessBundle | None:
    row = (
        await session.execute(
            select(TechnologicalProcess, ManufacturedItem.name)
            .outerjoin(
                ManufacturedItem,
                ManufacturedItem.id == TechnologicalProcess.output_item_id,
            )
            .where(TechnologicalProcess.id == process_id)
        )
    ).one_or_none()
    if row is None:
        return None
    versions = (await _versions_by_process(session, [process_id]))[process_id]
    if not versions:  # pragma: no cover - process creation is atomic with v1
        return None
    active = next((item for item in versions if item.status == "active"), None)
    return row[0], row[1], active, versions[0]


async def get_process_for_update(
    session: AsyncSession, process_id: uuid.UUID
) -> TechnologicalProcess | None:
    return (
        await session.execute(
            select(TechnologicalProcess)
            .where(TechnologicalProcess.id == process_id)
            .with_for_update()
        )
    ).scalar_one_or_none()


async def get_version(
    session: AsyncSession,
    *,
    process_id: uuid.UUID,
    version_id: uuid.UUID,
    for_update: bool = False,
) -> TechnologicalProcessVersion | None:
    statement = select(TechnologicalProcessVersion).where(
        TechnologicalProcessVersion.id == version_id,
        TechnologicalProcessVersion.process_id == process_id,
    )
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def list_versions(
    session: AsyncSession, process_id: uuid.UUID
) -> list[TechnologicalProcessVersion]:
    return list(
        (
            await session.execute(
                select(TechnologicalProcessVersion)
                .where(TechnologicalProcessVersion.process_id == process_id)
                .order_by(desc(TechnologicalProcessVersion.version_number))
            )
        )
        .scalars()
        .all()
    )


async def next_version_number(session: AsyncSession, process_id: uuid.UUID) -> int:
    process = await get_process_for_update(session, process_id)
    if process is None:
        return 0
    current = (
        await session.execute(
            select(func.coalesce(func.max(TechnologicalProcessVersion.version_number), 0)).where(
                TechnologicalProcessVersion.process_id == process_id
            )
        )
    ).scalar_one()
    return int(current) + 1


async def get_reference_states(
    session: AsyncSession,
    *,
    material_ids: set[uuid.UUID],
    item_ids: set[uuid.UUID],
    operation_ids: set[uuid.UUID],
) -> tuple[dict[uuid.UUID, bool], dict[uuid.UUID, bool], dict[uuid.UUID, bool]]:
    materials = {
        item.id: item.archived
        for item in (
            (await session.execute(select(Material).where(Material.id.in_(material_ids))))
            .scalars()
            .all()
            if material_ids
            else []
        )
    }
    manufactured = {
        item.id: item.archived
        for item in (
            (
                await session.execute(
                    select(ManufacturedItem).where(ManufacturedItem.id.in_(item_ids))
                )
            )
            .scalars()
            .all()
            if item_ids
            else []
        )
    }
    operations = {
        item.id: item.archived
        for item in (
            (await session.execute(select(Operation).where(Operation.id.in_(operation_ids))))
            .scalars()
            .all()
            if operation_ids
            else []
        )
    }
    return materials, manufactured, operations


async def active_manufactured_dependencies(
    session: AsyncSession, *, exclude_process_id: uuid.UUID
) -> list[tuple[uuid.UUID, uuid.UUID]]:
    rows = (
        await session.execute(
            select(
                TechnologicalProcess.output_item_id,
                TechnologicalProcessNode.reference_id,
            )
            .join(
                TechnologicalProcessVersion,
                TechnologicalProcessVersion.process_id == TechnologicalProcess.id,
            )
            .join(
                TechnologicalProcessNode,
                TechnologicalProcessNode.version_id == TechnologicalProcessVersion.id,
            )
            .where(
                TechnologicalProcessVersion.status == "active",
                TechnologicalProcess.id != exclude_process_id,
                TechnologicalProcess.output_item_id.is_not(None),
                TechnologicalProcessNode.node_type == "manufactured_item",
                TechnologicalProcessNode.reference_id.is_not(None),
            )
        )
    ).all()
    dependencies: list[tuple[uuid.UUID, uuid.UUID]] = []
    for output_item_id, dependency_item_id in rows:
        if output_item_id is not None and dependency_item_id is not None:
            dependencies.append((output_item_id, dependency_item_id))
    return dependencies


async def activate_version(
    session: AsyncSession,
    *,
    process: TechnologicalProcess,
    version: TechnologicalProcessVersion,
) -> None:
    await session.execute(
        update(TechnologicalProcessVersion)
        .where(
            TechnologicalProcessVersion.process_id == process.id,
            TechnologicalProcessVersion.status == "active",
            TechnologicalProcessVersion.id != version.id,
        )
        .values(status="archived")
    )
    version.status = "active"
    if process.output_item_id is not None:
        item = await session.get(ManufacturedItem, process.output_item_id)
        if item is not None:
            item.active_process_id = version.id
    await session.flush()


async def archive_process(session: AsyncSession, process: TechnologicalProcess) -> None:
    process.archived = True
    await session.execute(
        update(TechnologicalProcessVersion)
        .where(TechnologicalProcessVersion.process_id == process.id)
        .values(status="archived")
    )
    if process.output_item_id is not None:
        item = await session.get(ManufacturedItem, process.output_item_id)
        if item is not None:
            item.active_process_id = None
    await session.flush()
