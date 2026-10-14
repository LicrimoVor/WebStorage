from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from asyncpg import InvalidPasswordError
from scripts import migrate as runner


@pytest.mark.parametrize("valid_password", [True, False])
async def test_connection_check_does_not_migrate_and_disposes_on_authentication_failure(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    valid_password: bool,
) -> None:
    engine = MagicMock()
    engine.dispose = AsyncMock()
    connection = AsyncMock()
    engine.connect.return_value.__aenter__.return_value = connection
    if not valid_password:
        engine.connect.return_value.__aenter__.side_effect = InvalidPasswordError("bad password")
    monkeypatch.setattr(runner, "create_async_engine", lambda *args, **kwargs: engine)
    monkeypatch.setattr(
        runner,
        "get_settings",
        lambda: SimpleNamespace(
            database_url="postgresql+asyncpg://webstorage:secret-password@database/webstorage"
        ),
    )

    def unexpected_migration(*args: object, **kwargs: object) -> None:
        pytest.fail("A connection check must not apply migrations")

    monkeypatch.setattr(runner.command, "upgrade", unexpected_migration)
    if valid_password:
        await runner.check_connection()
        connection.execute.assert_awaited_once()
        assert str(connection.execute.await_args.args[0]) == "SELECT 1"
    else:
        with pytest.raises(InvalidPasswordError):
            await runner.check_connection()
        connection.execute.assert_not_awaited()
    engine.dispose.assert_awaited_once()
    output = capsys.readouterr().out
    assert "secret-password" not in output
    assert ("Database connection verified" in output) == valid_password
