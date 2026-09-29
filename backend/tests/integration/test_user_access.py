import pytest
from app.core.config import get_settings
from app.core.security import Role
from app.modules.auth.service import create_user
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker


@pytest.mark.asyncio
async def test_admin_manages_users_and_tab_access_is_enforced(
    client: AsyncClient,
    database_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with async_sessionmaker(database_engine, expire_on_commit=False)() as session:
        await create_user(session, username="admin", password="admin password", roles=[Role.ADMIN])
    monkeypatch.setenv("AUTH_DISABLED", "false")
    get_settings.cache_clear()
    try:
        pair = (
            await client.post(
                "/api/v1/auth/login",
                json={
                    "username": "admin",
                    "password": "admin password",
                },
            )
        ).json()
        admin = {"Authorization": f"Bearer {pair['access_token']}"}
        payload = {
            "username": "stock-user",
            "password": "test password!",
            "permissions": ["warehouse"],
            "is_admin": False,
            "active": True,
        }
        created = await client.post("/api/v1/users", headers=admin, json=payload)
        assert created.status_code == 201, created.text
        user = created.json()
        assert "password" not in user and "password_hash" not in user
        assert (await client.post("/api/v1/users", headers=admin, json=payload)).status_code == 409
        assert (
            await client.post(
                "/api/v1/users",
                headers=admin,
                json={
                    **payload,
                    "username": "short",
                    "password": "bad",
                },
            )
        ).status_code == 422
        login = (
            await client.post(
                "/api/v1/auth/login",
                json={
                    "username": "stock-user",
                    "password": "test password!",
                },
            )
        ).json()
        stock = {"Authorization": f"Bearer {login['access_token']}"}
        assert login["permissions"] == ["warehouse"]
        assert (await client.get("/api/v1/materials", headers=stock)).status_code == 200
        for endpoint in [
            "/finance/entries",
            "/users",
            "/sales",
            "/audit-events",
            "/exports/finance_entries.xlsx",
            "/operations",
            "/employees/11111111-1111-4111-8111-111111111111/payroll-summary",
        ]:
            assert (await client.get(f"/api/v1{endpoint}", headers=stock)).status_code == 403
        assert (await client.post("/api/v1/users", headers=stock, json=payload)).status_code == 403
        assert (
            await client.put(
                f"/api/v1/users/{user['id']}", headers=stock, json={**payload, "is_admin": True}
            )
        ).status_code == 403
        changed = {**payload, "password": None, "permissions": ["repairs"]}
        assert (
            await client.put(f"/api/v1/users/{user['id']}", headers=admin, json=changed)
        ).status_code == 200
        # Existing tokens see new rights immediately. Read-only catalogs remain available.
        assert (await client.get("/api/v1/auth/session", headers=stock)).json()["permissions"] == [
            "repairs"
        ]
        assert (await client.get("/api/v1/materials", headers=stock)).status_code == 200
        assert (await client.post("/api/v1/materials", headers=stock, json={})).status_code == 403
        assert (
            await client.get(
                "/api/v1/warehouse/revision?type=material",
                headers=stock,
            )
        ).status_code == 200
        assert (await client.get("/api/v1/warehouse/revision", headers=stock)).status_code in {
            403,
            404,
        }
        assert (
            await client.get("/api/v1/business-documents?kind=repair", headers=stock)
        ).status_code == 200
        assert (
            await client.get("/api/v1/business-documents?kind=receipt", headers=stock)
        ).status_code == 403
        # Password changes revoke access and refresh sessions.
        assert (
            await client.put(
                f"/api/v1/users/{user['id']}",
                headers=admin,
                json={**changed, "password": "new password!"},
            )
        ).status_code == 200
        assert (await client.get("/api/v1/auth/session", headers=stock)).status_code == 401
        assert (
            await client.post(
                "/api/v1/auth/refresh", json={"refresh_token": login["refresh_token"]}
            )
        ).status_code == 401
        new_login = await client.post(
            "/api/v1/auth/login", json={"username": "stock-user", "password": "new password!"}
        )
        assert new_login.status_code == 200
        assert (
            await client.put(
                f"/api/v1/users/{user['id']}", headers=admin, json={**changed, "active": False}
            )
        ).status_code == 200
        assert (
            await client.post(
                "/api/v1/auth/login", json={"username": "stock-user", "password": "new password!"}
            )
        ).status_code == 401
        users = (await client.get("/api/v1/users", headers=admin)).json()
        admin_user = next(row for row in users if row["username"] == "admin")
        assert (
            await client.put(
                f"/api/v1/users/{admin_user['id']}",
                headers=admin,
                json={"username": "admin", "is_admin": False},
            )
        ).status_code == 422
    finally:
        get_settings.cache_clear()
