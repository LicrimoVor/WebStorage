import pytest
from app.core.config import get_settings
from app.core.security import Role
from app.modules.auth.service import create_user
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker


@pytest.mark.asyncio
async def test_profile_password_change_preserves_current_session_and_revokes_others(
    client: AsyncClient, database_engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    sessions = async_sessionmaker(database_engine, expire_on_commit=False)
    async with sessions() as session:
        await create_user(
            session, username="profile-user", password="initial password", roles=[Role.WAREHOUSE]
        )
    monkeypatch.setenv("AUTH_DISABLED", "false")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    get_settings.cache_clear()
    try:
        assert (await client.get("/api/v1/auth/profile")).status_code == 401
        assert (
            await client.post(
                "/api/v1/auth/password",
                json={"current_password": "initial password", "new_password": "new password"},
            )
        ).status_code == 401
        login = {"username": "profile-user", "password": "initial password"}
        assert (await client.post("/api/v1/auth/login", json=login)).status_code == 200
        old_cookie = client.cookies.get("webstorage_session")
        assert (await client.post("/api/v1/auth/login", json=login)).status_code == 200
        current_cookie = client.cookies.get("webstorage_session")
        profile = await client.get("/api/v1/auth/profile")
        assert profile.status_code == 200
        assert profile.json()["username"] == "profile-user"
        assert profile.json()["roles"] == ["warehouse"]
        assert profile.json()["created_at"]
        assert profile.json()["last_login_at"]
        assert profile.json()["can_change_password"] is True
        assert "password" not in {k for k in profile.json() if k != "can_change_password"}

        wrong = await client.post(
            "/api/v1/auth/password",
            json={"current_password": "wrong password", "new_password": "new password"},
        )
        assert wrong.status_code == 422
        assert (await client.get("/api/v1/auth/session")).status_code == 200
        short = await client.post(
            "/api/v1/auth/password",
            json={"current_password": "initial password", "new_password": "short"},
        )
        assert short.status_code == 422
        changed = await client.post(
            "/api/v1/auth/password",
            json={"current_password": "initial password", "new_password": "new password"},
        )
        assert changed.status_code == 204, changed.text
        assert (await client.get("/api/v1/auth/session")).status_code == 200
        client.cookies.clear()
        client.cookies.set("webstorage_session", old_cookie or "")
        assert (await client.get("/api/v1/auth/session")).status_code == 401
        client.cookies.clear()
        assert (await client.post("/api/v1/auth/login", json=login)).status_code == 401
        assert (
            await client.post("/api/v1/auth/login", json={**login, "password": "new password"})
        ).status_code == 200
        client.cookies.clear()
        client.cookies.set("webstorage_session", current_cookie or "")
        assert (await client.get("/api/v1/auth/session")).status_code == 200
        # Existing sessions cannot be used to brute-force the current password indefinitely.
        for _ in range(5):
            assert (
                await client.post(
                    "/api/v1/auth/password",
                    json={"current_password": "wrong password", "new_password": "another password"},
                )
            ).status_code == 422
        locked = await client.post(
            "/api/v1/auth/password",
            json={"current_password": "new password", "new_password": "another password"},
        )
        assert locked.status_code == 422
        assert "15" in locked.json()["detail"]
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_development_profile_has_no_password_controls(client: AsyncClient) -> None:
    profile = await client.get("/api/v1/auth/profile")
    assert profile.status_code == 200
    assert profile.json()["can_change_password"] is False
    assert (
        await client.post(
            "/api/v1/auth/password",
            json={"current_password": "password", "new_password": "new password"},
        )
    ).status_code == 422
