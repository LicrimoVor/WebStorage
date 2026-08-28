import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.query import SortOrder
from app.modules.operations import service
from app.modules.operations.schemas import (
    OperationCreate,
    OperationList,
    OperationRead,
    OperationSortField,
    OperationUpdate,
)

router = APIRouter(
    prefix="/operations",
    tags=["operations"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]


@router.post(
    "",
    response_model=OperationRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createOperation",
    responses={409: {"model": ProblemDetail}},
)
async def create_operation(payload: OperationCreate, session: Session) -> OperationRead:
    return await service.create(session, payload)


@router.get("", response_model=OperationList, operation_id="listOperations")
async def list_operations(
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query(max_length=200)] = None,
    include_archived: bool = False,
    sort_by: OperationSortField = OperationSortField.NAME,
    sort_order: SortOrder = SortOrder.ASC,
) -> OperationList:
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
    "/{operation_id}",
    response_model=OperationRead,
    operation_id="getOperation",
    responses={404: {"model": ProblemDetail}},
)
async def get_operation(operation_id: uuid.UUID, session: Session) -> OperationRead:
    return await service.get(session, operation_id)


@router.patch(
    "/{operation_id}",
    response_model=OperationRead,
    operation_id="updateOperation",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def update_operation(
    operation_id: uuid.UUID, payload: OperationUpdate, session: Session
) -> OperationRead:
    return await service.update(session, operation_id, payload)


@router.post(
    "/{operation_id}/archive",
    response_model=OperationRead,
    operation_id="archiveOperation",
    responses={404: {"model": ProblemDetail}},
)
async def archive_operation(operation_id: uuid.UUID, session: Session) -> OperationRead:
    return await service.archive(session, operation_id)
