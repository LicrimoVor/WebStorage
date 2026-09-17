from unittest.mock import AsyncMock, MagicMock

import pytest
from app.modules.audit import middleware


@pytest.fixture(autouse=True)
def isolated_request_audit(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unit tests must not write to PostgreSQL through the request middleware."""
    session = MagicMock()
    session.commit = AsyncMock()
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=session)
    context.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(middleware, "async_session_factory", lambda: context)
