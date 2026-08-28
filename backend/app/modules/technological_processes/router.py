import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.query import SortOrder
from app.core.security import Actor, get_current_actor
from app.modules.technological_processes import service
from app.modules.technological_processes.schemas import (
    ProcessCreate,
    ProcessDraftSave,
    ProcessGraphDocument,
    ProcessImportResult,
    ProcessList,
    ProcessRead,
    ProcessSortField,
    ProcessUpdate,
    ProcessVersionCreate,
    ProcessVersionList,
    ProcessVersionRead,
)

router = APIRouter(
    prefix="/technological-processes",
    tags=["technological processes"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


@router.post(
    "",
    response_model=ProcessImportResult,
    status_code=status.HTTP_201_CREATED,
    operation_id="createTechnologicalProcess",
    responses={409: {"model": ProblemDetail}},
)
async def create_technological_process(
    payload: ProcessCreate, session: Session, actor: ActorDependency
) -> ProcessImportResult:
    return await service.create(session, payload, created_by=actor.subject)


@router.post(
    "/import",
    response_model=ProcessImportResult,
    status_code=status.HTTP_201_CREATED,
    operation_id="importTechnologicalProcess",
    responses={409: {"model": ProblemDetail}},
)
async def import_technological_process(
    payload: ProcessGraphDocument, session: Session, actor: ActorDependency
) -> ProcessImportResult:
    return await service.import_document(session, payload, created_by=actor.subject)


@router.get("", response_model=ProcessList, operation_id="listTechnologicalProcesses")
async def list_technological_processes(
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query(max_length=200)] = None,
    include_archived: bool = False,
    sort_by: ProcessSortField = ProcessSortField.UPDATED_AT,
    sort_order: SortOrder = SortOrder.DESC,
) -> ProcessList:
    return await service.list_all(
        session,
        page=page,
        page_size=page_size,
        search=search,
        include_archived=include_archived,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get(
    "/{process_id}",
    response_model=ProcessRead,
    operation_id="getTechnologicalProcess",
    responses={404: {"model": ProblemDetail}},
)
async def get_technological_process(process_id: uuid.UUID, session: Session) -> ProcessRead:
    return await service.get(session, process_id)


@router.patch(
    "/{process_id}",
    response_model=ProcessRead,
    operation_id="updateTechnologicalProcess",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def update_technological_process(
    process_id: uuid.UUID, payload: ProcessUpdate, session: Session
) -> ProcessRead:
    return await service.update_process(session, process_id, payload)


@router.post(
    "/{process_id}/archive",
    response_model=ProcessRead,
    operation_id="archiveTechnologicalProcess",
    responses={404: {"model": ProblemDetail}},
)
async def archive_technological_process(process_id: uuid.UUID, session: Session) -> ProcessRead:
    return await service.archive(session, process_id)


@router.post(
    "/{process_id}/versions",
    response_model=ProcessVersionRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createTechnologicalProcessVersion",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def create_technological_process_version(
    process_id: uuid.UUID,
    payload: ProcessVersionCreate,
    session: Session,
    actor: ActorDependency,
) -> ProcessVersionRead:
    return await service.create_version(session, process_id, payload, created_by=actor.subject)


@router.get(
    "/{process_id}/versions",
    response_model=ProcessVersionList,
    operation_id="listTechnologicalProcessVersions",
    responses={404: {"model": ProblemDetail}},
)
async def list_technological_process_versions(
    process_id: uuid.UUID, session: Session
) -> ProcessVersionList:
    return await service.list_versions(session, process_id)


@router.get(
    "/{process_id}/versions/{version_id}",
    response_model=ProcessVersionRead,
    operation_id="getTechnologicalProcessVersion",
    responses={404: {"model": ProblemDetail}},
)
async def get_technological_process_version(
    process_id: uuid.UUID, version_id: uuid.UUID, session: Session
) -> ProcessVersionRead:
    return await service.get_version(session, process_id, version_id)


@router.get(
    "/{process_id}/versions/{version_id}/export",
    response_model=ProcessGraphDocument,
    operation_id="exportTechnologicalProcessVersion",
    responses={404: {"model": ProblemDetail}},
)
async def export_technological_process_version(
    process_id: uuid.UUID, version_id: uuid.UUID, session: Session
) -> ProcessGraphDocument:
    return (await service.get_version(session, process_id, version_id)).graph


@router.put(
    "/{process_id}/versions/{version_id}/graph",
    response_model=ProcessVersionRead,
    operation_id="replaceTechnologicalProcessGraph",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def replace_technological_process_graph(
    process_id: uuid.UUID,
    version_id: uuid.UUID,
    payload: ProcessGraphDocument,
    session: Session,
) -> ProcessVersionRead:
    return await service.replace_graph(session, process_id, version_id, payload)


@router.put(
    "/{process_id}/versions/{version_id}/draft",
    response_model=ProcessVersionRead,
    operation_id="saveTechnologicalProcessDraft",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def save_technological_process_draft(
    process_id: uuid.UUID,
    version_id: uuid.UUID,
    payload: ProcessDraftSave,
    session: Session,
) -> ProcessVersionRead:
    return await service.save_draft(session, process_id, version_id, payload)


@router.post(
    "/{process_id}/versions/{version_id}/activate",
    response_model=ProcessVersionRead,
    operation_id="activateTechnologicalProcessVersion",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def activate_technological_process_version(
    process_id: uuid.UUID, version_id: uuid.UUID, session: Session
) -> ProcessVersionRead:
    return await service.activate(session, process_id, version_id)
