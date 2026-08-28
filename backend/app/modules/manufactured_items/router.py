import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.query import AvailabilityFilter, SortOrder
from app.modules.inventory.schemas import InventoryMovementCreate
from app.modules.manufactured_items import movement_service, service
from app.modules.manufactured_items.schemas import (
    ManufacturedItemCreate,
    ManufacturedItemKind,
    ManufacturedItemList,
    ManufacturedItemMovementList,
    ManufacturedItemMovementRead,
    ManufacturedItemRead,
    ManufacturedItemSortField,
    ManufacturedItemUpdate,
)

router = APIRouter(
    prefix="/manufactured-items",
    tags=["manufactured items"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]


@router.post(
    "",
    response_model=ManufacturedItemRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createManufacturedItem",
    responses={409: {"model": ProblemDetail}},
)
async def create_manufactured_item(
    payload: ManufacturedItemCreate, session: Session
) -> ManufacturedItemRead:
    return await service.create(session, payload)


@router.get(
    "", response_model=ManufacturedItemList, operation_id="listManufacturedItems"
)
async def list_manufactured_items(
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query(max_length=200)] = None,
    include_archived: bool = False,
    availability: AvailabilityFilter = AvailabilityFilter.ALL,
    kind: ManufacturedItemKind = ManufacturedItemKind.ALL,
    sort_by: ManufacturedItemSortField = ManufacturedItemSortField.NAME,
    sort_order: SortOrder = SortOrder.ASC,
) -> ManufacturedItemList:
    return await service.list_all(
        session,
        page=page,
        page_size=page_size,
        search=search,
        include_archived=include_archived,
        availability=availability,
        kind=kind,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get(
    "/{item_id}",
    response_model=ManufacturedItemRead,
    operation_id="getManufacturedItem",
    responses={404: {"model": ProblemDetail}},
)
async def get_manufactured_item(
    item_id: uuid.UUID, session: Session
) -> ManufacturedItemRead:
    return await service.get(session, item_id)


@router.patch(
    "/{item_id}",
    response_model=ManufacturedItemRead,
    operation_id="updateManufacturedItem",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def update_manufactured_item(
    item_id: uuid.UUID, payload: ManufacturedItemUpdate, session: Session
) -> ManufacturedItemRead:
    return await service.update(session, item_id, payload)


@router.post(
    "/{item_id}/archive",
    response_model=ManufacturedItemRead,
    operation_id="archiveManufacturedItem",
    responses={404: {"model": ProblemDetail}},
)
async def archive_manufactured_item(
    item_id: uuid.UUID, session: Session
) -> ManufacturedItemRead:
    return await service.archive(session, item_id)


@router.post(
    "/{item_id}/movements",
    response_model=ManufacturedItemMovementRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createManufacturedItemMovement",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def create_manufactured_item_movement(
    item_id: uuid.UUID,
    payload: InventoryMovementCreate,
    session: Session,
) -> ManufacturedItemMovementRead:
    return await movement_service.apply_manual_movement(
        session, item_id=item_id, payload=payload
    )


@router.get(
    "/{item_id}/movements",
    response_model=ManufacturedItemMovementList,
    operation_id="listManufacturedItemMovements",
    responses={404: {"model": ProblemDetail}},
)
async def list_manufactured_item_movements(
    item_id: uuid.UUID,
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ManufacturedItemMovementList:
    return await movement_service.history(
        session, item_id=item_id, page=page, page_size=page_size
    )
