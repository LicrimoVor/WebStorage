import threading
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.core.errors import AuthenticationError
from app.modules.auth import service
from sqlalchemy.ext.asyncio import AsyncSession


async def test_unknown_user_password_check_runs_outside_event_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    event_loop_thread = threading.get_ident()
    worker_threads: list[int] = []

    def verify(password: str, password_hash: str) -> tuple[bool, None]:
        worker_threads.append(threading.get_ident())
        assert password == "invalid-password"
        assert password_hash == service.DUMMY_PASSWORD_HASH
        return False, None

    monkeypatch.setattr(service, "verify_password", verify)
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session = AsyncMock(spec=AsyncSession)
    session.execute.return_value = result

    with pytest.raises(AuthenticationError):
        await service.authenticate(
            session, username="missing", password="invalid-password",
            session_ttl=timedelta(hours=12),
        )
    assert len(worker_threads) == 1
    assert worker_threads[0] != event_loop_thread
    session.commit.assert_not_awaited()
