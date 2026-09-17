from unittest.mock import AsyncMock

import pytest
from app.core.database import get_session
from app.core.security import Actor, Role, get_current_actor
from app.main import app
from app.modules.exports import service
from httpx import ASGITransport, AsyncClient


@pytest.mark.parametrize("role", [Role.WAREHOUSE, Role.PRODUCTION])
async def test_financial_export_rejects_operational_roles(
    role: Role, monkeypatch: pytest.MonkeyPatch,
) -> None:
    create_export = AsyncMock()
    monkeypatch.setattr(service, "create_export", create_export)
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_current_actor] = lambda: Actor(
        subject="operator", roles=frozenset({role}),
    )
    app.dependency_overrides[get_session] = lambda: None
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/exports/finance_entries.xlsx")
        assert response.status_code == 403
        create_export.assert_not_awaited()
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
