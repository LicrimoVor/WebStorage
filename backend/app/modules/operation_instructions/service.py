import hashlib
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.modules.media import service as media_service
from app.modules.media.schemas import ImageUploadRequest
from app.modules.operation_instructions import repository
from app.modules.operation_instructions.exports import ExportedInstruction, export_instruction
from app.modules.operation_instructions.markdown import render_markdown
from app.modules.operation_instructions.model import (
    OperationInstruction,
    OperationInstructionAsset,
    OperationInstructionPublicLink,
    OperationInstructionVersion,
)
from app.modules.operation_instructions.schemas import (
    InstructionAssetRead,
    InstructionDraftSave,
    InstructionRead,
    InstructionVersionRead,
    InstructionVersionSummary,
    PublicInstructionRead,
    PublicLinkCreate,
    PublicLinkRead,
)
from app.modules.operations.model import Operation


def _version_read(version: OperationInstructionVersion) -> InstructionVersionRead:
    return InstructionVersionRead(
        id=version.id,
        version_number=version.version_number,
        revision=version.revision,
        status=version.status,
        title=version.title,
        content=version.content,
        rendered_html=render_markdown(version.content),
        created_by=version.created_by,
        published_by=version.published_by,
        published_at=version.published_at,
        created_at=version.created_at,
        updated_at=version.updated_at,
    )


def _version_summary(version: OperationInstructionVersion) -> InstructionVersionSummary:
    return InstructionVersionSummary.model_validate(version)


async def _operation(session: AsyncSession, operation_id: uuid.UUID) -> Operation:
    operation = await repository.get_operation(session, operation_id)
    if operation is None:
        raise NotFoundError("Operation was not found")
    return operation


async def _instruction(
    session: AsyncSession, operation_id: uuid.UUID, *, create: bool, for_update: bool = False
) -> OperationInstruction | None:
    instruction = await repository.get_instruction(session, operation_id, for_update=for_update)
    if instruction is None and create:
        instruction = OperationInstruction(operation_id=operation_id)
        session.add(instruction)
        await session.flush()
    return instruction


async def get_instruction(
    session: AsyncSession, operation_id: uuid.UUID, *, include_private: bool
) -> InstructionRead:
    operation = await _operation(session, operation_id)
    instruction = await _instruction(session, operation_id, create=False)
    if instruction is None:
        return InstructionRead(
            operation_id=operation.id,
            operation_name=operation.name,
            status="absent",
            draft=None,
            published=None,
            versions=[],
        )
    draft = (
        await repository.get_version_by_status(session, instruction.id, "draft")
        if include_private
        else None
    )
    published = await repository.get_version_by_status(session, instruction.id, "published")
    versions = (
        await repository.list_versions(session, instruction.id)
        if include_private
        else ([published] if published else [])
    )
    status = "draft" if draft is not None else "published" if published is not None else "absent"
    return InstructionRead(
        operation_id=operation.id,
        operation_name=operation.name,
        status=status,
        draft=_version_read(draft) if draft else None,
        published=_version_read(published) if published else None,
        versions=[_version_summary(version) for version in versions],
    )


async def save_draft(
    session: AsyncSession,
    operation_id: uuid.UUID,
    payload: InstructionDraftSave,
    *,
    actor: str,
) -> InstructionVersionRead:
    await _operation(session, operation_id)
    instruction = await _instruction(session, operation_id, create=True, for_update=True)
    assert instruction is not None
    draft = await repository.get_version_by_status(session, instruction.id, "draft")
    if draft is None:
        if payload.expected_revision not in {None, 0}:
            raise ConflictError("The instruction draft has changed; reload it and try again")
        draft = OperationInstructionVersion(
            instruction_id=instruction.id,
            version_number=await repository.next_version_number(session, instruction.id),
            revision=0,
            status="draft",
            title=payload.title,
            content=payload.content,
            created_by=actor,
        )
        session.add(draft)
    else:
        if payload.expected_revision is not None and payload.expected_revision != draft.revision:
            raise ConflictError("The instruction draft has changed; reload it and try again")
        draft.title = payload.title
        draft.content = payload.content
        draft.revision += 1
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("The instruction was changed by another user") from error
    await session.refresh(draft)
    return _version_read(draft)


async def publish(
    session: AsyncSession, operation_id: uuid.UUID, *, actor: str
) -> InstructionVersionRead:
    await _operation(session, operation_id)
    instruction = await _instruction(session, operation_id, create=False, for_update=True)
    if instruction is None:
        raise DomainValidationError("Create and save an instruction draft before publishing")
    draft = await repository.get_version_by_status(session, instruction.id, "draft")
    if draft is None:
        raise DomainValidationError("There is no instruction draft to publish")
    if not draft.content.strip():
        raise DomainValidationError("An empty instruction cannot be published")
    published = await repository.get_version_by_status(session, instruction.id, "published")
    if published:
        published.status = "archived"
        # Release the partial unique index before promoting the next version.
        await session.flush()
    draft.status = "published"
    draft.published_by = actor
    draft.published_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(draft)
    return _version_read(draft)


async def get_version(
    session: AsyncSession, operation_id: uuid.UUID, version_id: uuid.UUID
) -> InstructionVersionRead:
    await _operation(session, operation_id)
    instruction = await _instruction(session, operation_id, create=False)
    if instruction is None:
        raise NotFoundError("Instruction was not found")
    version = await repository.get_version(session, instruction.id, version_id)
    if version is None:
        raise NotFoundError("Instruction version was not found")
    return _version_read(version)


async def upload_asset(
    session: AsyncSession,
    operation_id: uuid.UUID,
    payload: ImageUploadRequest,
    *,
    actor: str,
    base_url: str,
) -> InstructionAssetRead:
    await _operation(session, operation_id)
    instruction = await _instruction(session, operation_id, create=True)
    assert instruction is not None
    uploaded = await media_service.upload(payload, base_url=base_url)
    asset = OperationInstructionAsset(
        instruction_id=instruction.id,
        url=uploaded.url,
        filename=payload.filename,
        content_type=uploaded.content_type,
        size=uploaded.size,
        created_by=actor,
    )
    session.add(asset)
    await session.commit()
    await session.refresh(asset)
    return InstructionAssetRead.model_validate(asset)


async def list_assets(session: AsyncSession, operation_id: uuid.UUID) -> list[InstructionAssetRead]:
    await _operation(session, operation_id)
    instruction = await _instruction(session, operation_id, create=False)
    if instruction is None:
        return []
    assets = await repository.list_assets(session, instruction.id)
    return [InstructionAssetRead.model_validate(asset) for asset in assets]


async def delete_asset(session: AsyncSession, operation_id: uuid.UUID, asset_id: uuid.UUID) -> None:
    await _operation(session, operation_id)
    instruction = await _instruction(session, operation_id, create=False)
    if instruction is None:
        raise NotFoundError("Instruction asset was not found")
    asset = await repository.get_asset(session, instruction.id, asset_id)
    if asset is None or asset.deleted_at is not None:
        raise NotFoundError("Instruction asset was not found")
    asset.deleted_at = datetime.now(UTC)
    await session.commit()


def _link_read(
    link: OperationInstructionPublicLink,
    *,
    token: str | None = None,
    public_app_url: str | None = None,
) -> PublicLinkRead:
    now = datetime.now(UTC)
    active = link.revoked_at is None and (link.expires_at is None or link.expires_at > now)
    public_url = None
    qr_url = None
    if token and public_app_url:
        public_url = f"{public_app_url.rstrip('/')}/public/instructions/{token}"
        qr_url = f"/api/v1/public/instructions/{token}/qr.svg"
    return PublicLinkRead(
        id=link.id,
        expires_at=link.expires_at,
        revoked_at=link.revoked_at,
        created_at=link.created_at,
        active=active,
        public_url=public_url,
        qr_url=qr_url,
    )


async def create_public_link(
    session: AsyncSession,
    operation_id: uuid.UUID,
    payload: PublicLinkCreate,
    *,
    actor: str,
    public_app_url: str,
) -> PublicLinkRead:
    await _operation(session, operation_id)
    instruction = await _instruction(session, operation_id, create=False, for_update=True)
    if (
        instruction is None
        or await repository.get_version_by_status(session, instruction.id, "published") is None
    ):
        raise DomainValidationError("Publish the instruction before creating a public link")
    now = datetime.now(UTC)
    expires_at = payload.expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= now:
            raise DomainValidationError("Public link expiration must be in the future")
    if payload.revoke_existing:
        for current in await repository.list_public_links(session, instruction.id):
            if current.revoked_at is None:
                current.revoked_at = now
    token = secrets.token_urlsafe(32)
    link = OperationInstructionPublicLink(
        instruction_id=instruction.id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=expires_at,
        created_by=actor,
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return _link_read(link, token=token, public_app_url=public_app_url)


async def list_public_links(session: AsyncSession, operation_id: uuid.UUID) -> list[PublicLinkRead]:
    await _operation(session, operation_id)
    instruction = await _instruction(session, operation_id, create=False)
    if instruction is None:
        return []
    links = await repository.list_public_links(session, instruction.id)
    return [_link_read(link) for link in links]


async def revoke_public_link(
    session: AsyncSession, operation_id: uuid.UUID, link_id: uuid.UUID
) -> PublicLinkRead:
    await _operation(session, operation_id)
    instruction = await _instruction(session, operation_id, create=False)
    if instruction is None:
        raise NotFoundError("Public instruction link was not found")
    link = await repository.get_public_link(session, instruction.id, link_id)
    if link is None:
        raise NotFoundError("Public instruction link was not found")
    if link.revoked_at is None:
        link.revoked_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(link)
    return _link_read(link)


async def get_public_instruction(session: AsyncSession, token: str) -> PublicInstructionRead:
    if len(token) < 32 or len(token) > 100:
        raise NotFoundError("Public instruction link was not found")
    row = await repository.get_public_document(session, hashlib.sha256(token.encode()).hexdigest())
    if row is None:
        raise NotFoundError("Public instruction link was not found")
    link, operation, version = row
    now = datetime.now(UTC)
    if link.revoked_at is not None or (link.expires_at is not None and link.expires_at <= now):
        raise NotFoundError("Public instruction link was not found")
    assert version.published_at is not None
    return PublicInstructionRead(
        operation_id=operation.id,
        operation_name=operation.name,
        title=version.title,
        content=version.content,
        rendered_html=render_markdown(version.content),
        version_number=version.version_number,
        published_at=version.published_at,
    )


async def export_document(
    session: AsyncSession,
    operation_id: uuid.UUID,
    export_format: str,
    *,
    version_id: uuid.UUID | None = None,
) -> ExportedInstruction:
    operation = await _operation(session, operation_id)
    instruction = await _instruction(session, operation_id, create=False)
    if instruction is None:
        raise NotFoundError("Instruction was not found")
    if version_id:
        version = await repository.get_version(session, instruction.id, version_id)
    else:
        version = await repository.get_version_by_status(session, instruction.id, "published")
        if version is None:
            version = await repository.get_version_by_status(session, instruction.id, "draft")
    if version is None:
        raise NotFoundError("Instruction version was not found")
    try:
        return export_instruction(
            export_format,
            operation_name=operation.name,
            content=version.content,
            version_number=version.version_number,
        )
    except ValueError as error:
        raise DomainValidationError("Unsupported instruction export format") from error
