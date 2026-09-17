import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ConflictError
from app.core.security import Actor, Role, get_current_actor, require_any_role
from app.modules.business.model import BusinessDocument, FundingSource, ProductUnit
from app.modules.business.schemas import (
    FundingSourceCreate,
    FundingSourceRead,
    ReceiptCreate,
    RepairCreate,
)
from app.modules.business.service import document_read, register_document

router = APIRouter(tags=["business"])
Session = Annotated[AsyncSession, Depends(get_session)]
CurrentActor = Annotated[Actor, Depends(get_current_actor)]
Key = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=100)]


@router.get("/funding-sources", response_model=list[FundingSourceRead])
async def sources(session: Session) -> Any:
    return (await session.scalars(select(FundingSource).order_by(FundingSource.name))).all()


@router.post("/funding-sources", response_model=FundingSourceRead, status_code=201)
async def create_source(payload: FundingSourceCreate, session: Session, actor: CurrentActor) -> Any:
    require_any_role(actor, Role.FINANCE)
    source = FundingSource(name=payload.name)
    if await session.scalar(
        select(FundingSource.id).where(func.lower(FundingSource.name) == payload.name.lower())
    ):
        raise ConflictError("Источник с таким названием уже существует")  # noqa: RUF001
    session.add(source)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("Источник с таким названием уже существует") from error  # noqa: RUF001
    await session.refresh(source)
    return source


@router.post("/warehouse/receipts", status_code=201)
async def receipt(
    payload: ReceiptCreate, session: Session, actor: CurrentActor, idempotency_key: Key
) -> Any:
    require_any_role(actor, Role.WAREHOUSE, Role.FINANCE)
    return await register_document(session, payload, key=idempotency_key, actor=actor.subject)


@router.post("/repairs", status_code=201)
async def repair(
    payload: RepairCreate, session: Session, actor: CurrentActor, idempotency_key: Key
) -> Any:
    require_any_role(actor, Role.WAREHOUSE, Role.PRODUCTION)
    return await register_document(session, payload, key=idempotency_key, actor=actor.subject)


@router.get("/business-documents")
async def history(
    session: Session,
    kind: str = Query(pattern="^(receipt|repair)$"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> Any:
    rows = await session.scalars(
        select(BusinessDocument)
        .where(BusinessDocument.kind == kind)
        .order_by(BusinessDocument.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [document_read(row) for row in rows]


@router.get("/product-units")
async def units(
    session: Session,
    product_id: uuid.UUID | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> Any:
    query = select(ProductUnit)
    if product_id:
        query = query.where(ProductUnit.product_id == product_id)
    rows = await session.scalars(
        query.order_by(ProductUnit.created_at.desc()).offset(offset).limit(limit)
    )
    return [
        {
            "id": row.id,
            "serial_number": row.serial_number,
            "product_id": row.product_id,
            "photo": row.photo,
            "sale_id": row.sale_id,
            "issued_for_repair_id": row.issued_for_repair_id,
            "created_at": row.created_at,
        }
        for row in rows
    ]
