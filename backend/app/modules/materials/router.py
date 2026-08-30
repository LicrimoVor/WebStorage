import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.query import AvailabilityFilter, SortOrder
from app.modules.materials import service
from app.modules.materials.schemas import (
    MaterialCreate,
    MaterialList,
    MaterialRead,
    MaterialSortField,
    MaterialUpdate,
)

router = APIRouter(
    prefix="/materials",
    tags=["materials"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]


@router.post(
    "",
    response_model=MaterialRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createMaterial",
    responses={409: {"model": ProblemDetail}},
)
async def create_material(payload: MaterialCreate, session: Session) -> MaterialRead:
    return await service.create(session, payload)


@router.get("", response_model=MaterialList, operation_id="listMaterials")
async def list_materials(
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query(max_length=200)] = None,
    include_archived: bool = False,
    availability: AvailabilityFilter = AvailabilityFilter.ALL,
    deficit_only: bool = False,
    sort_by: MaterialSortField = MaterialSortField.NAME,
    sort_order: SortOrder = SortOrder.ASC,
    product_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
) -> MaterialList:
    return await service.list_all(
        session,
        page=page,
        page_size=page_size,
        search=search,
        include_archived=include_archived,
        availability=availability,
        deficit_only=deficit_only,
        sort_by=sort_by,
        sort_order=sort_order,
        product_id=product_id,
        group_id=group_id,
    )


@router.get(
    "/{material_id}",
    response_model=MaterialRead,
    operation_id="getMaterial",
    responses={404: {"model": ProblemDetail}},
)
async def get_material(material_id: uuid.UUID, session: Session) -> MaterialRead:
    return await service.get(session, material_id)


@router.patch(
    "/{material_id}",
    response_model=MaterialRead,
    operation_id="updateMaterial",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def update_material(
    material_id: uuid.UUID, payload: MaterialUpdate, session: Session
) -> MaterialRead:
    return await service.update(session, material_id, payload)


@router.post(
    "/{material_id}/archive",
    response_model=MaterialRead,
    operation_id="archiveMaterial",
    responses={404: {"model": ProblemDetail}},
)
async def archive_material(material_id: uuid.UUID, session: Session) -> MaterialRead:
    return await service.archive(session, material_id)
