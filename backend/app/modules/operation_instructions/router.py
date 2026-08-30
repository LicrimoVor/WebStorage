import uuid
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.security import Actor, Role, get_current_actor, require_any_role
from app.modules.media.schemas import ImageUploadRequest
from app.modules.operation_instructions import service
from app.modules.operation_instructions.exports import qr_svg
from app.modules.operation_instructions.schemas import (
    InstructionAssetRead,
    InstructionDraftSave,
    InstructionRead,
    InstructionVersionRead,
    PublicInstructionRead,
    PublicLinkCreate,
    PublicLinkRead,
)

router = APIRouter(
    prefix="/operations/{operation_id}/instruction",
    tags=["operation instructions"],
    responses={422: {"model": ProblemDetail}},
)
public_router = APIRouter(
    prefix="/public/instructions",
    tags=["public operation instructions"],
    responses={404: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


@router.get("", response_model=InstructionRead, operation_id="getOperationInstruction")
async def get_operation_instruction(
    operation_id: uuid.UUID, session: Session, actor: ActorDependency
) -> InstructionRead:
    include_private = Role.ADMIN in actor.roles or Role.MANAGER in actor.roles
    return await service.get_instruction(session, operation_id, include_private=include_private)


@router.put(
    "/draft", response_model=InstructionVersionRead, operation_id="saveOperationInstructionDraft"
)
async def save_operation_instruction_draft(
    operation_id: uuid.UUID,
    payload: InstructionDraftSave,
    session: Session,
    actor: ActorDependency,
) -> InstructionVersionRead:
    require_any_role(actor, Role.MANAGER)
    return await service.save_draft(session, operation_id, payload, actor=actor.subject)


@router.post(
    "/publish",
    response_model=InstructionVersionRead,
    operation_id="publishOperationInstruction",
)
async def publish_operation_instruction(
    operation_id: uuid.UUID, session: Session, actor: ActorDependency
) -> InstructionVersionRead:
    require_any_role(actor, Role.MANAGER)
    return await service.publish(session, operation_id, actor=actor.subject)


@router.get(
    "/versions/{version_id}",
    response_model=InstructionVersionRead,
    operation_id="getOperationInstructionVersion",
)
async def get_operation_instruction_version(
    operation_id: uuid.UUID,
    version_id: uuid.UUID,
    session: Session,
    actor: ActorDependency,
) -> InstructionVersionRead:
    require_any_role(actor, Role.MANAGER)
    return await service.get_version(session, operation_id, version_id)


@router.get(
    "/assets",
    response_model=list[InstructionAssetRead],
    operation_id="listOperationInstructionAssets",
)
async def list_operation_instruction_assets(
    operation_id: uuid.UUID, session: Session, actor: ActorDependency
) -> list[InstructionAssetRead]:
    require_any_role(actor, Role.MANAGER)
    return await service.list_assets(session, operation_id)


@router.post(
    "/assets",
    response_model=InstructionAssetRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="uploadOperationInstructionAsset",
)
async def upload_operation_instruction_asset(
    operation_id: uuid.UUID,
    payload: ImageUploadRequest,
    request: Request,
    session: Session,
    actor: ActorDependency,
) -> InstructionAssetRead:
    require_any_role(actor, Role.MANAGER)
    return await service.upload_asset(
        session,
        operation_id,
        payload,
        actor=actor.subject,
        base_url=str(request.base_url),
    )


@router.delete(
    "/assets/{asset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteOperationInstructionAsset",
)
async def delete_operation_instruction_asset(
    operation_id: uuid.UUID,
    asset_id: uuid.UUID,
    session: Session,
    actor: ActorDependency,
) -> Response:
    require_any_role(actor, Role.MANAGER)
    await service.delete_asset(session, operation_id, asset_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/export/{export_format}", operation_id="exportOperationInstruction")
async def export_operation_instruction(
    operation_id: uuid.UUID,
    export_format: Literal["md", "txt", "docx", "pdf"],
    session: Session,
    actor: ActorDependency,
    version_id: Annotated[uuid.UUID | None, Query()] = None,
) -> Response:
    require_any_role(actor, Role.MANAGER)
    document = await service.export_document(
        session, operation_id, export_format, version_id=version_id
    )
    encoded_name = quote(document.filename)
    return Response(
        content=document.body,
        media_type=document.media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"},
    )


@router.get(
    "/public-links",
    response_model=list[PublicLinkRead],
    operation_id="listOperationInstructionPublicLinks",
)
async def list_operation_instruction_public_links(
    operation_id: uuid.UUID, session: Session, actor: ActorDependency
) -> list[PublicLinkRead]:
    require_any_role(actor, Role.MANAGER)
    return await service.list_public_links(session, operation_id)


@router.post(
    "/public-links",
    response_model=PublicLinkRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createOperationInstructionPublicLink",
)
async def create_operation_instruction_public_link(
    operation_id: uuid.UUID,
    payload: PublicLinkCreate,
    session: Session,
    actor: ActorDependency,
) -> PublicLinkRead:
    require_any_role(actor, Role.MANAGER)
    return await service.create_public_link(
        session,
        operation_id,
        payload,
        actor=actor.subject,
        public_app_url=get_settings().public_app_url,
    )


@router.post(
    "/public-links/{link_id}/revoke",
    response_model=PublicLinkRead,
    operation_id="revokeOperationInstructionPublicLink",
)
async def revoke_operation_instruction_public_link(
    operation_id: uuid.UUID,
    link_id: uuid.UUID,
    session: Session,
    actor: ActorDependency,
) -> PublicLinkRead:
    require_any_role(actor, Role.MANAGER)
    return await service.revoke_public_link(session, operation_id, link_id)


@public_router.get(
    "/{token}",
    response_model=PublicInstructionRead,
    operation_id="getPublicOperationInstruction",
)
async def get_public_operation_instruction(token: str, session: Session) -> PublicInstructionRead:
    return await service.get_public_instruction(session, token)


@public_router.get(
    "/{token}/qr.svg",
    response_class=Response,
    operation_id="getPublicOperationInstructionQr",
)
async def get_public_operation_instruction_qr(token: str, session: Session) -> Response:
    await service.get_public_instruction(session, token)
    public_url = f"{get_settings().public_app_url.rstrip('/')}/public/instructions/{token}"
    return Response(
        content=qr_svg(public_url),
        media_type="image/svg+xml",
        headers={"Content-Disposition": "inline; filename=instruction-qr.svg"},
    )
