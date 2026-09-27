from datetime import UTC, datetime, timedelta

import pytest
from app import cli
from app.core.errors import NotFoundError
from app.core.security import Role
from app.modules.auth.model import AuthSession, UserAccount
from app.modules.auth.passwords import verify_password
from app.modules.auth.service import authenticate, create_user
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker


@pytest.mark.asyncio
async def test_cli_recovers_password_and_revokes_sessions(
    database_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    sessions = async_sessionmaker(database_engine, expire_on_commit=False)
    monkeypatch.setattr(cli, "async_session_factory", sessions)
    old_password = "old recovery password"
    new_password = "new recovery password"
    async with sessions() as session:
        user = await create_user(
            session, username="recovery-user", password=old_password, roles=[Role.WAREHOUSE]
        )
        await authenticate(
            session, username=user.username, password=old_password, session_ttl=timedelta(hours=1)
        )
        user.active = False
        user.failed_login_attempts = 4
        user.locked_until = datetime.now(UTC) + timedelta(minutes=15)
        await session.commit()
        user_id = user.id
    values = iter([new_password, new_password])
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt: next(values))
    await cli._run(cli._parser().parse_args(["reset-password", "RECOVERY-USER"]))
    async with sessions() as session:
        recovered = await session.get(UserAccount, user_id)
        assert recovered is not None
        assert verify_password(new_password, recovered.password_hash)[0]
        assert not verify_password(old_password, recovered.password_hash)[0]
        assert recovered.locked_until is None
        assert recovered.failed_login_attempts == 0
        assert recovered.active is False
        assert recovered.roles == ["warehouse"]
        assert await session.scalar(select(func.count()).select_from(AuthSession)) == 0
    output = capsys.readouterr()
    assert new_password not in output.out + output.err
    assert "sessions revoked" in output.out


@pytest.mark.asyncio
async def test_cli_recovery_does_not_create_missing_user(
    database_engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    sessions = async_sessionmaker(database_engine, expire_on_commit=False)
    monkeypatch.setattr(cli, "async_session_factory", sessions)
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt: "a valid new password")
    with pytest.raises(NotFoundError):
        await cli._run(cli._parser().parse_args(["reset-password", "missing-user"]))
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(UserAccount)) == 0
