import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import Actor, get_current_actor
from app.modules.externals import service
from app.modules.externals.model import ExternalProvider
from app.modules.externals.schemas import (
    ExternalReceiptCreate,
    OfferRead,
    OfferWrite,
    ProviderRead,
    ProviderWrite,
)
from app.modules.trash.model import visible_entry

router = APIRouter(tags=["external providers"])
Session = Annotated[AsyncSession, Depends(get_session)]
CurrentActor = Annotated[Actor, Depends(get_current_actor)]


@router.get("/external-providers", response_model=list[ProviderRead])
async def list_providers(session: Session) -> Any:
    return (
        await session.scalars(
            select(ExternalProvider)
            .where(visible_entry(ExternalProvider.id, "external_provider"))
            .order_by(ExternalProvider.name)
        )
    ).all()


@router.post("/external-providers", response_model=ProviderRead, status_code=201)
async def create_provider(payload: ProviderWrite, session: Session) -> ExternalProvider:
    return await service.save_provider(session, payload)


@router.patch("/external-providers/{provider_id}", response_model=ProviderRead)
async def update_provider(
    provider_id: uuid.UUID, payload: ProviderWrite, session: Session
) -> ExternalProvider:
    return await service.save_provider(session, payload, provider_id)


@router.get("/external-offers", response_model=list[OfferRead])
async def list_offers(session: Session, provider_id: uuid.UUID | None = None) -> list[OfferRead]:
    return await service.offers(session, provider_id)


@router.post("/external-offers", response_model=OfferRead, status_code=201)
async def create_offer(payload: OfferWrite, session: Session) -> OfferRead:
    return await service.save_offer(session, payload)


@router.put("/external-offers/{offer_id}", response_model=OfferRead)
async def update_offer(offer_id: uuid.UUID, payload: OfferWrite, session: Session) -> OfferRead:
    return await service.save_offer(session, payload, offer_id)


@router.post("/external-receipts", status_code=201)
async def receive(
    payload: ExternalReceiptCreate,
    session: Session,
    actor: CurrentActor,
    key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=100)],
) -> dict[str, Any]:
    return await service.receive(session, payload, key, actor.subject)
