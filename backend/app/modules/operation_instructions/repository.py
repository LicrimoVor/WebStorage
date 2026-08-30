import uuid
from collections.abc import Sequence
from typing import cast

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.operation_instructions.model import (
    OperationInstruction,
    OperationInstructionAsset,
    OperationInstructionPublicLink,
    OperationInstructionVersion,
)
from app.modules.operations.model import Operation


async def get_operation(session: AsyncSession, operation_id: uuid.UUID) -> Operation | None:
    return await session.get(Operation, operation_id)


async def get_instruction(
    session: AsyncSession, operation_id: uuid.UUID, *, for_update: bool = False
) -> OperationInstruction | None:
    statement: Select[tuple[OperationInstruction]] = select(OperationInstruction).where(
        OperationInstruction.operation_id == operation_id
    )
    if for_update:
        statement = statement.with_for_update()
    return cast(OperationInstruction | None, await session.scalar(statement))


async def get_version_by_status(
    session: AsyncSession, instruction_id: uuid.UUID, status: str
) -> OperationInstructionVersion | None:
    return cast(
        OperationInstructionVersion | None,
        await session.scalar(
            select(OperationInstructionVersion).where(
                OperationInstructionVersion.instruction_id == instruction_id,
                OperationInstructionVersion.status == status,
            ),
        ),
    )


async def get_version(
    session: AsyncSession, instruction_id: uuid.UUID, version_id: uuid.UUID
) -> OperationInstructionVersion | None:
    return cast(
        OperationInstructionVersion | None,
        await session.scalar(
            select(OperationInstructionVersion).where(
                OperationInstructionVersion.id == version_id,
                OperationInstructionVersion.instruction_id == instruction_id,
            ),
        ),
    )


async def list_versions(
    session: AsyncSession, instruction_id: uuid.UUID
) -> Sequence[OperationInstructionVersion]:
    result = await session.scalars(
        select(OperationInstructionVersion)
        .where(OperationInstructionVersion.instruction_id == instruction_id)
        .order_by(OperationInstructionVersion.version_number.desc())
    )
    return result.all()


async def next_version_number(session: AsyncSession, instruction_id: uuid.UUID) -> int:
    latest = await session.scalar(
        select(func.max(OperationInstructionVersion.version_number)).where(
            OperationInstructionVersion.instruction_id == instruction_id
        )
    )
    return int(latest or 0) + 1


async def list_assets(
    session: AsyncSession, instruction_id: uuid.UUID
) -> Sequence[OperationInstructionAsset]:
    result = await session.scalars(
        select(OperationInstructionAsset)
        .where(
            OperationInstructionAsset.instruction_id == instruction_id,
            OperationInstructionAsset.deleted_at.is_(None),
        )
        .order_by(OperationInstructionAsset.created_at)
    )
    return result.all()


async def get_asset(
    session: AsyncSession, instruction_id: uuid.UUID, asset_id: uuid.UUID
) -> OperationInstructionAsset | None:
    return cast(
        OperationInstructionAsset | None,
        await session.scalar(
            select(OperationInstructionAsset).where(
                OperationInstructionAsset.id == asset_id,
                OperationInstructionAsset.instruction_id == instruction_id,
            ),
        ),
    )


async def list_public_links(
    session: AsyncSession, instruction_id: uuid.UUID
) -> Sequence[OperationInstructionPublicLink]:
    result = await session.scalars(
        select(OperationInstructionPublicLink)
        .where(OperationInstructionPublicLink.instruction_id == instruction_id)
        .order_by(OperationInstructionPublicLink.created_at.desc())
    )
    return result.all()


async def get_public_link(
    session: AsyncSession, instruction_id: uuid.UUID, link_id: uuid.UUID
) -> OperationInstructionPublicLink | None:
    return cast(
        OperationInstructionPublicLink | None,
        await session.scalar(
            select(OperationInstructionPublicLink).where(
                OperationInstructionPublicLink.id == link_id,
                OperationInstructionPublicLink.instruction_id == instruction_id,
            ),
        ),
    )


async def get_public_document(
    session: AsyncSession, token_hash: str
) -> tuple[OperationInstructionPublicLink, Operation, OperationInstructionVersion] | None:
    result = await session.execute(
        select(
            OperationInstructionPublicLink,
            Operation,
            OperationInstructionVersion,
        )
        .join(
            OperationInstruction,
            OperationInstruction.id == OperationInstructionPublicLink.instruction_id,
        )
        .join(Operation, Operation.id == OperationInstruction.operation_id)
        .join(
            OperationInstructionVersion,
            OperationInstructionVersion.instruction_id == OperationInstruction.id,
        )
        .where(
            OperationInstructionPublicLink.token_hash == token_hash,
            OperationInstructionVersion.status == "published",
        )
    )
    row = result.one_or_none()
    return tuple(row) if row is not None else None
