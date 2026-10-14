from types import SimpleNamespace

import pytest
from scripts import migrate as runner
from sqlalchemy.ext.asyncio import AsyncEngine


@pytest.mark.asyncio
async def test_migration_runner_verifies_real_database_head(
    database_engine: AsyncEngine, capsys: pytest.CaptureFixture[str]
) -> None:
    del database_engine
    await runner.migrate()
    output = capsys.readouterr().out
    assert "Database after upgrade:" in output
    assert "; verified" in output
    assert "webstorage_test" in output


@pytest.mark.asyncio
async def test_successful_noop_cannot_hide_missing_migrations(
    database_engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    del database_engine
    monkeypatch.setattr(
        runner.ScriptDirectory,
        "from_config",
        lambda config: SimpleNamespace(get_heads=lambda: ["unapplied_revision"]),
    )
    monkeypatch.setattr(runner.command, "upgrade", lambda config, target: None)
    with pytest.raises(RuntimeError, match="Migrations were not applied"):
        await runner.migrate()
