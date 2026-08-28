import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.modules.inventory import service
from app.modules.inventory.schemas import (
    InventoryMovementCreate,
    InventoryMovementList,
    InventoryMovementRead,
)

router = APIRouter(
    prefix="/materials/{material_id}/movements",
    tags=["inventory"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]


@router.post(
    "",
    response_model=InventoryMovementRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createInventoryMovement",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def create_inventory_movement(
    material_id: uuid.UUID,
    payload: InventoryMovementCreate,
    session: Session,
) -> InventoryMovementRead:
    return await service.apply_manual_movement(
        session, material_id=material_id, payload=payload
    )


@router.get(
    "",
    response_model=InventoryMovementList,
    operation_id="listInventoryMovements",
    responses={404: {"model": ProblemDetail}},
)
async def list_inventory_movements(
    material_id: uuid.UUID,
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> InventoryMovementList:
    return await service.history(
        session,
        material_id=material_id,
        page=page,
        page_size=page_size,
    )
