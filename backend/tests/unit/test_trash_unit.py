import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, Mock

import pytest
from app.core.errors import AuthorizationError, ConflictError, NotFoundError
from app.core.security import Actor, Role
from app.modules.employees.model import Employee
from app.modules.finance import editing
from app.modules.finance.repository import entry_union
from app.modules.materials.model import Material
from app.modules.technological_processes.model import TechnologicalProcess
from app.modules.trash import router, service
from app.modules.trash.model import TrashEntry
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["material", "employee"])
async def test_delete_and_restore_keep_the_original_record(kind: str) -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = None
    target = (
        Material(id=uuid.uuid4(), name="Material", archived=False)
        if kind == "material"
        else Employee(id=uuid.uuid4(), full_name="Employee", active=True)
    )
    session.get.return_value = target
    entry = await service.move_to_trash(session, kind, target.id, "admin")
    assert entry.entity_id == target.id
    assert entry.deleted_by == "admin"
    assert target.archived if kind == "material" else not target.active
    session.delete.assert_not_called()
    session.commit.assert_not_called()
    session.get.side_effect = [entry, target]
    # Catalog validation runs against an empty set of groups/names.
    session.execute.return_value = Mock()
    session.execute.return_value.all.return_value = []
    await service.restore(session, entry.id, "restorer")
    assert not target.archived if kind == "material" else target.active
    assert entry.restored_by == "restorer"
    assert entry.restored_at is not None
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_repeated_delete_reuses_one_active_trash_entry() -> None:
    session = AsyncMock(spec=AsyncSession)
    entry = TrashEntry(id=uuid.uuid4(), entity_type="material", entity_id=uuid.uuid4())
    session.scalar.return_value = entry
    assert await service.move_to_trash(session, "material", entry.entity_id, "admin") is entry
    session.get.assert_not_called()
    session.add.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("restored", [False, True])
async def test_restore_rejects_missing_or_already_restored_entry(restored: bool) -> None:
    session = AsyncMock(spec=AsyncSession)
    session.get.return_value = TrashEntry(restored_at=datetime.now(UTC)) if restored else None
    with pytest.raises(NotFoundError):
        await service.restore(session, uuid.uuid4(), "admin")
    session.commit.assert_not_called()


@pytest.mark.asyncio
async def test_financial_delete_retains_a_snapshot_without_deleting_stock_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = None
    snapshot = {"description": "Receipt", "amount": "100.00"}
    session.get.return_value = None
    monkeypatch.setattr(editing, "snapshot", AsyncMock(return_value=snapshot))
    entry = await service.move_to_trash(session, "finance_entry", uuid.uuid4(), "admin")
    assert entry.state == {"entry": snapshot}
    session.delete.assert_not_called()
    session.get.return_value = entry
    await service.restore(session, entry.id, "admin")
    assert entry.restored_at is not None


def test_every_financial_source_excludes_active_trash_entries() -> None:
    sql = str(
        entry_union()
        .select()
        .compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    )
    assert sql.count("trash_entries.entity_type = 'finance_entry'") == 5
    for table in (
        "financial_transactions",
        "sales",
        "employee_payments",
        "inventory_movements",
        "business_documents",
    ):
        assert f"trash_entries.entity_id = {table}.id" in sql


@pytest.mark.asyncio
async def test_process_restore_preserves_draft_and_active_versions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.modules.manufactured_items.model import ManufacturedItem
    from app.modules.technological_processes import repository
    from app.modules.technological_processes import service as process_service
    from app.modules.technological_processes.model import TechnologicalProcessVersion

    monkeypatch.setattr(repository, "get_graph", AsyncMock(return_value=([], [])))
    monkeypatch.setattr(process_service, "_activation_errors", AsyncMock(return_value=[]))

    session = AsyncMock(spec=AsyncSession)
    process = TechnologicalProcess(id=uuid.uuid4(), archived=True, output_item_id=uuid.uuid4())
    active = TechnologicalProcessVersion(id=uuid.uuid4(), status="archived")
    draft = TechnologicalProcessVersion(id=uuid.uuid4(), status="archived")
    item = ManufacturedItem(id=process.output_item_id, active_process_id=None)
    entry = TrashEntry(
        entity_type="process",
        entity_id=process.id,
        state={
            "archived": False,
            "versions": {
                str(active.id): "active",
                str(draft.id): "draft",
            },
        },
    )
    session.get.side_effect = [entry, process, item]
    session.scalars.return_value = [active, draft]
    await service.restore(session, entry.id, "admin")
    assert active.status == "active"
    assert draft.status == "draft"
    assert not process.archived
    assert process.deleted_at is None
    assert item.active_process_id == active.id


@pytest.mark.asyncio
async def test_group_restore_requires_its_parent_first() -> None:
    session = AsyncMock(spec=AsyncSession)
    entry = TrashEntry(entity_type="inventory_group", state={"parent_id": str(uuid.uuid4())})
    session.get.side_effect = [entry, None]
    with pytest.raises(ConflictError):
        await service.restore(session, entry.id, "admin")
    session.commit.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["delete", "restore", "list"])
async def test_trash_is_admin_only_before_any_database_access(action: str) -> None:
    session = AsyncMock(spec=AsyncSession)
    actor = Actor(subject="user", roles=frozenset({Role.USER}))
    with pytest.raises(AuthorizationError):
        if action == "delete":
            await router.delete_entity("material", uuid.uuid4(), session, actor)
        elif action == "restore":
            await router.restore_entry(uuid.uuid4(), session, actor)
        else:
            await router.list_trash(session, actor)
    session.execute.assert_not_called()
