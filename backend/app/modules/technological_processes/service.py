import math
import uuid
from collections import defaultdict, deque
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.core.query import SortOrder
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.technological_processes import repository
from app.modules.technological_processes.model import (
    TechnologicalProcess,
    TechnologicalProcessEdge,
    TechnologicalProcessNode,
    TechnologicalProcessVersion,
)
from app.modules.technological_processes.schemas import (
    GraphEdge,
    GraphNode,
    GraphPosition,
    ProcessCreate,
    ProcessGraphDocument,
    ProcessImportResult,
    ProcessList,
    ProcessNodeType,
    ProcessRead,
    ProcessSortField,
    ProcessStatus,
    ProcessUpdate,
    ProcessVersionCreate,
    ProcessVersionList,
    ProcessVersionRead,
    ProcessVersionSummary,
)


def _clean_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise DomainValidationError("Process name must not be blank")
    return cleaned


def _version_summary(version: TechnologicalProcessVersion) -> ProcessVersionSummary:
    return ProcessVersionSummary(
        id=version.id,
        version_number=version.version_number,
        status=ProcessStatus(version.status),
        schema_version=version.schema_version,
        created_by=version.created_by,
        activated_at=version.activated_at,
        created_at=version.created_at,
        updated_at=version.updated_at,
    )


def _process_read(bundle: repository.ProcessBundle) -> ProcessRead:
    process, output_name, active, latest = bundle
    return ProcessRead(
        id=process.id,
        name=process.name,
        output_item_id=process.output_item_id,
        output_item_name=output_name,
        archived=process.archived,
        active_version=_version_summary(active) if active is not None else None,
        latest_version=_version_summary(latest),
        created_at=process.created_at,
        updated_at=process.updated_at,
    )


def _graph_document(
    process: TechnologicalProcess,
    version: TechnologicalProcessVersion,
    nodes: list[TechnologicalProcessNode],
    edges: list[TechnologicalProcessEdge],
) -> ProcessGraphDocument:
    return ProcessGraphDocument(
        schemaVersion=1,
        name=process.name,
        outputItemId=process.output_item_id,
        nodes=[
            GraphNode(
                id=node.external_id,
                type=ProcessNodeType(node.node_type),
                referenceId=node.reference_id,
                label=node.label,
                position=GraphPosition(x=node.position_x, y=node.position_y),
            )
            for node in nodes
        ],
        edges=[
            GraphEdge(
                id=edge.external_id,
                source=edge.source_node_id,
                target=edge.target_node_id,
                quantity=edge.quantity,
            )
            for edge in edges
        ],
    )


def _graph_entities(
    version_id: uuid.UUID, document: ProcessGraphDocument
) -> tuple[list[TechnologicalProcessNode], list[TechnologicalProcessEdge]]:
    nodes = [
        TechnologicalProcessNode(
            version_id=version_id,
            external_id=node.id,
            node_type=node.type.value,
            reference_id=node.reference_id,
            label=node.label,
            position_x=node.position.x,
            position_y=node.position.y,
        )
        for node in document.nodes
    ]
    edges = [
        TechnologicalProcessEdge(
            version_id=version_id,
            external_id=edge.id,
            source_node_id=edge.source,
            target_node_id=edge.target,
            quantity=edge.quantity,
        )
        for edge in document.edges
    ]
    return nodes, edges


async def _version_read(
    session: AsyncSession,
    process: TechnologicalProcess,
    version: TechnologicalProcessVersion,
) -> ProcessVersionRead:
    nodes, edges = await repository.get_graph(session, version.id)
    return ProcessVersionRead(
        **_version_summary(version).model_dump(),
        process_id=process.id,
        graph=_graph_document(process, version, nodes, edges),
    )


async def _get_output_item(
    session: AsyncSession, item_id: uuid.UUID
) -> ManufacturedItem:
    item = await session.get(ManufacturedItem, item_id)
    if item is None:
        raise DomainValidationError("Output manufactured item was not found")
    if item.archived:
        raise DomainValidationError("Output manufactured item is archived")
    return item


async def _get_process(
    session: AsyncSession, process_id: uuid.UUID, *, for_update: bool = False
) -> TechnologicalProcess:
    process = (
        await repository.get_process_for_update(session, process_id)
        if for_update
        else await session.get(TechnologicalProcess, process_id)
    )
    if process is None:
        raise NotFoundError("Technological process was not found")
    return process


async def _get_version(
    session: AsyncSession,
    process_id: uuid.UUID,
    version_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> TechnologicalProcessVersion:
    version = await repository.get_version(
        session,
        process_id=process_id,
        version_id=version_id,
        for_update=for_update,
    )
    if version is None:
        raise NotFoundError("Technological process version was not found")
    return version


async def create(
    session: AsyncSession, payload: ProcessCreate, *, created_by: str
) -> ProcessImportResult:
    output = await _get_output_item(session, payload.output_item_id)
    process = TechnologicalProcess(
        name=_clean_name(payload.name), output_item_id=output.id
    )
    try:
        await repository.create_process(session, process)
        version = TechnologicalProcessVersion(
            process_id=process.id,
            version_number=1,
            status=ProcessStatus.DRAFT.value,
            schema_version=1,
            created_by=created_by,
        )
        await repository.create_version(session, version)
        nodes, edges = _graph_entities(
            version.id,
            ProcessGraphDocument(
                name=process.name,
                outputItemId=output.id,
                nodes=[
                    GraphNode(
                        id="output",
                        type=ProcessNodeType.OUTPUT,
                        referenceId=output.id,
                        label=output.name,
                    )
                ],
            ),
        )
        await repository.add_graph(session, nodes=nodes, edges=edges)
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError(
            "A process with this name or output manufactured item already exists"
        ) from error
    bundle = await repository.get_process_bundle(session, process.id)
    if bundle is None:  # pragma: no cover - creation above is atomic
        raise NotFoundError("Technological process was not found")
    return ProcessImportResult(
        process=_process_read(bundle),
        version=await _version_read(session, process, version),
    )


async def import_document(
    session: AsyncSession, document: ProcessGraphDocument, *, created_by: str
) -> ProcessImportResult:
    if document.output_item_id is not None:
        await _get_output_item(session, document.output_item_id)
    process = TechnologicalProcess(
        name=_clean_name(document.name), output_item_id=document.output_item_id
    )
    try:
        await repository.create_process(session, process)
        version = TechnologicalProcessVersion(
            process_id=process.id,
            version_number=1,
            status=ProcessStatus.DRAFT.value,
            schema_version=document.schema_version,
            created_by=created_by,
        )
        await repository.create_version(session, version)
        nodes, edges = _graph_entities(version.id, document)
        await repository.add_graph(session, nodes=nodes, edges=edges)
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError(
            "A process with this name or output manufactured item already exists"
        ) from error
    bundle = await repository.get_process_bundle(session, process.id)
    if bundle is None:  # pragma: no cover - creation above is atomic
        raise NotFoundError("Technological process was not found")
    return ProcessImportResult(
        process=_process_read(bundle),
        version=await _version_read(session, process, version),
    )


async def list_all(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    include_archived: bool,
    sort_by: ProcessSortField,
    sort_order: SortOrder,
) -> ProcessList:
    bundles, total = await repository.list_processes(
        session,
        page=page,
        page_size=page_size,
        search=search,
        include_archived=include_archived,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return ProcessList(
        items=[_process_read(bundle) for bundle in bundles],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def get(session: AsyncSession, process_id: uuid.UUID) -> ProcessRead:
    bundle = await repository.get_process_bundle(session, process_id)
    if bundle is None:
        raise NotFoundError("Technological process was not found")
    return _process_read(bundle)


async def update_process(
    session: AsyncSession, process_id: uuid.UUID, payload: ProcessUpdate
) -> ProcessRead:
    process = await _get_process(session, process_id, for_update=True)
    if process.archived:
        raise ConflictError("Archived technological process cannot be changed")
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        process.name = _clean_name(changes["name"])
    if "output_item_id" in changes:
        output_item_id = changes["output_item_id"]
        if output_item_id is None:
            raise DomainValidationError("Output manufactured item cannot be cleared")
        if any(
            version.status == ProcessStatus.ACTIVE.value
            for version in await repository.list_versions(session, process.id)
        ):
            raise ConflictError("Output of a process with an active version cannot change")
        process.output_item_id = (await _get_output_item(session, output_item_id)).id
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError(
            "A process with this name or output manufactured item already exists"
        ) from error
    return await get(session, process.id)


async def list_versions(
    session: AsyncSession, process_id: uuid.UUID
) -> ProcessVersionList:
    await _get_process(session, process_id)
    versions = await repository.list_versions(session, process_id)
    return ProcessVersionList(items=[_version_summary(item) for item in versions])


async def get_version(
    session: AsyncSession, process_id: uuid.UUID, version_id: uuid.UUID
) -> ProcessVersionRead:
    process = await _get_process(session, process_id)
    version = await _get_version(session, process_id, version_id)
    return await _version_read(session, process, version)


async def create_version(
    session: AsyncSession,
    process_id: uuid.UUID,
    payload: ProcessVersionCreate,
    *,
    created_by: str,
) -> ProcessVersionRead:
    process = await _get_process(session, process_id, for_update=True)
    if process.archived:
        raise ConflictError("Archived technological process cannot get a new version")
    versions = await repository.list_versions(session, process.id)
    source = (
        next((item for item in versions if item.id == payload.source_version_id), None)
        if payload.source_version_id is not None
        else next(
            (item for item in versions if item.status == ProcessStatus.ACTIVE.value),
            versions[0],
        )
    )
    if source is None:
        raise NotFoundError("Source technological process version was not found")
    version = TechnologicalProcessVersion(
        process_id=process.id,
        version_number=versions[0].version_number + 1,
        status=ProcessStatus.DRAFT.value,
        schema_version=source.schema_version,
        created_by=created_by,
    )
    try:
        await repository.create_version(session, version)
        source_nodes, source_edges = await repository.get_graph(session, source.id)
        document = _graph_document(process, source, source_nodes, source_edges)
        nodes, edges = _graph_entities(version.id, document)
        await repository.add_graph(session, nodes=nodes, edges=edges)
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("A concurrent version was already created") from error
    return await _version_read(session, process, version)


async def replace_graph(
    session: AsyncSession,
    process_id: uuid.UUID,
    version_id: uuid.UUID,
    document: ProcessGraphDocument,
) -> ProcessVersionRead:
    process = await _get_process(session, process_id, for_update=True)
    version = await _get_version(session, process_id, version_id, for_update=True)
    if process.archived or version.status != ProcessStatus.DRAFT.value:
        raise ConflictError("Only a draft version can be changed")
    if _clean_name(document.name) != process.name:
        raise DomainValidationError("Document name must match the process name")
    if document.output_item_id != process.output_item_id:
        raise DomainValidationError("Document outputItemId must match the process output")
    nodes, edges = _graph_entities(version.id, document)
    await repository.replace_graph(
        session, version_id=version.id, nodes=nodes, edges=edges
    )
    await session.commit()
    return await _version_read(session, process, version)


def _has_cycle(adjacency: dict[str, set[str]], node_ids: set[str]) -> bool:
    in_degree = {node_id: 0 for node_id in node_ids}
    for targets in adjacency.values():
        for target in targets:
            if target in in_degree:
                in_degree[target] += 1
    queue = deque(node_id for node_id, degree in in_degree.items() if degree == 0)
    visited = 0
    while queue:
        source = queue.popleft()
        visited += 1
        for target in adjacency.get(source, set()):
            if target not in in_degree:
                continue
            in_degree[target] -= 1
            if in_degree[target] == 0:
                queue.append(target)
    return visited != len(node_ids)


def _uuid_graph_has_cycle(edges: list[tuple[uuid.UUID, uuid.UUID]]) -> bool:
    adjacency: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    nodes: set[uuid.UUID] = set()
    for source, target in edges:
        nodes.update((source, target))
        adjacency[source].add(target)
    visiting: set[uuid.UUID] = set()
    visited: set[uuid.UUID] = set()

    def visit(node: uuid.UUID) -> bool:
        if node in visiting:
            return True
        if node in visited:
            return False
        visiting.add(node)
        if any(visit(target) for target in adjacency.get(node, set())):
            return True
        visiting.remove(node)
        visited.add(node)
        return False

    return any(visit(node) for node in nodes)


async def _activation_errors(
    session: AsyncSession,
    process: TechnologicalProcess,
    nodes: list[TechnologicalProcessNode],
    edges: list[TechnologicalProcessEdge],
) -> list[str]:
    errors: list[str] = []
    if process.output_item_id is None:
        errors.append("final output is not mapped")
    node_map = {node.external_id: node for node in nodes}
    output_nodes = [node for node in nodes if node.node_type == ProcessNodeType.OUTPUT.value]
    if len(output_nodes) != 1:
        errors.append("graph must contain exactly one final output node")
    elif (
        process.output_item_id is not None
        and output_nodes[0].reference_id != process.output_item_id
    ):
        errors.append("final output node is mapped to another manufactured item")
    if not nodes:
        errors.append("graph has no nodes")

    material_ids = {
        node.reference_id
        for node in nodes
        if node.node_type == ProcessNodeType.MATERIAL.value
        and node.reference_id is not None
    }
    manufactured_ids = {
        node.reference_id
        for node in nodes
        if node.node_type
        in {ProcessNodeType.MANUFACTURED_ITEM.value, ProcessNodeType.OUTPUT.value}
        and node.reference_id is not None
    }
    operation_ids = {
        node.reference_id
        for node in nodes
        if node.node_type == ProcessNodeType.OPERATION.value
        and node.reference_id is not None
    }
    material_states, item_states, operation_states = await repository.get_reference_states(
        session,
        material_ids=material_ids,
        item_ids=manufactured_ids,
        operation_ids=operation_ids,
    )
    states = {
        ProcessNodeType.MATERIAL.value: material_states,
        ProcessNodeType.MANUFACTURED_ITEM.value: item_states,
        ProcessNodeType.OPERATION.value: operation_states,
        ProcessNodeType.OUTPUT.value: item_states,
    }
    for node in nodes:
        if node.reference_id is None:
            errors.append(f"node '{node.external_id}' is not mapped")
            continue
        reference_state = states[node.node_type].get(node.reference_id)
        if reference_state is None:
            errors.append(f"node '{node.external_id}' references a missing entity")
        elif reference_state:
            errors.append(f"node '{node.external_id}' references an archived entity")

    adjacency: dict[str, set[str]] = defaultdict(set)
    reverse: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        if edge.source_node_id not in node_map or edge.target_node_id not in node_map:
            errors.append(f"edge '{edge.external_id}' is broken")
            continue
        if edge.quantity is None or edge.quantity <= 0:
            errors.append(f"edge '{edge.external_id}' has no positive quantity")
        adjacency[edge.source_node_id].add(edge.target_node_id)
        reverse[edge.target_node_id].add(edge.source_node_id)
    if _has_cycle(adjacency, set(node_map)):
        errors.append("graph contains a cycle")

    if len(output_nodes) == 1:
        final_id = output_nodes[0].external_id
        if adjacency.get(final_id):
            errors.append("final output node must not have outgoing dependencies")
        connected: set[str] = set()
        queue = deque([final_id])
        while queue:
            target = queue.popleft()
            if target in connected:
                continue
            connected.add(target)
            queue.extend(reverse.get(target, set()))
        for node_id in set(node_map) - connected:
            errors.append(f"node '{node_id}' has no chain to the final output")

    if process.output_item_id is not None:
        manufactured_dependencies = [
            (process.output_item_id, node.reference_id)
            for node in nodes
            if node.node_type == ProcessNodeType.MANUFACTURED_ITEM.value
            and node.reference_id is not None
        ]
        active_dependencies = await repository.active_manufactured_dependencies(
            session, exclude_process_id=process.id
        )
        if _uuid_graph_has_cycle([*active_dependencies, *manufactured_dependencies]):
            errors.append("manufactured item processes contain a dependency cycle")
    return errors


async def activate(
    session: AsyncSession, process_id: uuid.UUID, version_id: uuid.UUID
) -> ProcessVersionRead:
    process = await _get_process(session, process_id, for_update=True)
    version = await _get_version(session, process_id, version_id, for_update=True)
    if process.archived:
        raise ConflictError("Archived technological process cannot be activated")
    if version.status != ProcessStatus.DRAFT.value:
        raise ConflictError("Only a draft version can be activated")
    nodes, edges = await repository.get_graph(session, version.id)
    errors = await _activation_errors(session, process, nodes, edges)
    if errors:
        raise DomainValidationError("; ".join(errors))
    version.activated_at = datetime.now(UTC)
    try:
        await repository.activate_version(session, process=process, version=version)
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("Technological process activation conflicted") from error
    await session.refresh(version)
    return await _version_read(session, process, version)


async def archive(session: AsyncSession, process_id: uuid.UUID) -> ProcessRead:
    process = await _get_process(session, process_id, for_update=True)
    if not process.archived:
        await repository.archive_process(session, process)
        await session.commit()
    return await get(session, process.id)
