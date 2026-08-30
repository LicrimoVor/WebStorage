import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.security import Actor, get_current_actor
from app.modules.warehouse import service
from app.modules.warehouse.schemas import (
    InventoryGroupCreate,
    InventoryGroupRead,
    InventoryGroupUpdate,
    StockRevisionCreate,
    StockRevisionEntityType,
    StockRevisionRead,
    StockRevisionRow,
)

groups_router = APIRouter(
    prefix="/inventory-groups",
    tags=["inventory groups"],
    responses={422: {"model": ProblemDetail}},
)
warehouse_router = APIRouter(
    prefix="/warehouse",
    tags=["warehouse"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


@groups_router.get("", response_model=list[InventoryGroupRead], operation_id="listInventoryGroups")
async def list_inventory_groups(session: Session) -> list[InventoryGroupRead]:
    return await service.list_groups(session)


@groups_router.post(
    "",
    response_model=InventoryGroupRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createInventoryGroup",
    responses={409: {"model": ProblemDetail}},
)
async def create_inventory_group(
    payload: InventoryGroupCreate, session: Session
) -> InventoryGroupRead:
    return await service.create_group(session, payload)


@groups_router.put(
    "/{group_id}",
    response_model=InventoryGroupRead,
    operation_id="updateInventoryGroup",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def update_inventory_group(
    group_id: uuid.UUID, payload: InventoryGroupUpdate, session: Session
) -> InventoryGroupRead:
    return await service.update_group(session, group_id, payload)


@groups_router.delete(
    "/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteInventoryGroup",
    responses={404: {"model": ProblemDetail}},
)
async def delete_inventory_group(group_id: uuid.UUID, session: Session) -> Response:
    await service.delete_group(session, group_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@warehouse_router.get(
    "/revision",
    response_model=list[StockRevisionRow],
    operation_id="listStockRevisionRows",
)
async def list_stock_revision_rows(
    session: Session,
    search: Annotated[str | None, Query(max_length=200)] = None,
    type: StockRevisionEntityType | None = None,
    product_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
) -> list[StockRevisionRow]:
    return await service.list_revision_rows(
        session,
        search=search,
        entity_type=type,
        product_id=product_id,
        group_id=group_id,
    )


@warehouse_router.post(
    "/revisions",
    response_model=StockRevisionRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createStockRevision",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def create_stock_revision(
    payload: StockRevisionCreate,
    session: Session,
    actor: ActorDependency,
) -> StockRevisionRead:
    return await service.create_revision(session, payload, created_by=actor.subject)
