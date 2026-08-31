import pytest
from app.core.config import get_settings
from app.core.security import Role
from app.modules.auth.model import AuthSession, UserAccount
from app.modules.auth.service import create_user, set_user_password
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker


@pytest.mark.asyncio
async def test_password_login_cookie_logout_and_password_rotation(
    client: AsyncClient,
    database_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sessions = async_sessionmaker(database_engine, expire_on_commit=False)
    async with sessions() as session:
        user = await create_user(
            session,
            username="warehouse-admin",
            password="correct horse battery staple",
            roles=[Role.ADMIN],
        )
        assert user.password_hash.startswith("$argon2id$")
        assert "correct horse" not in user.password_hash

    monkeypatch.setenv("AUTH_DISABLED", "false")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    get_settings.cache_clear()
    try:
        anonymous = await client.get("/api/v1/me")
        assert anonymous.status_code == 401
        assert anonymous.headers["x-robots-tag"] == "noindex, nofollow, noarchive"
        assert anonymous.headers["cache-control"] == "no-store"

        rejected_origin = await client.post(
            "/api/v1/auth/login",
            headers={"Origin": "https://attacker.example"},
            json={
                "username": "warehouse-admin",
                "password": "correct horse battery staple",
            },
        )
        assert rejected_origin.status_code == 403
        assert rejected_origin.headers["x-frame-options"] == "DENY"

        invalid = await client.post(
            "/api/v1/auth/login",
            json={"username": "warehouse-admin", "password": "incorrect password"},
        )
        assert invalid.status_code == 401
        assert invalid.json()["detail"] == "Invalid username or password"

        login = await client.post(
            "/api/v1/auth/login",
            json={
                "username": "warehouse-admin",
                "password": "correct horse battery staple",
            },
        )
        assert login.status_code == 200, login.text
        cookie = login.headers["set-cookie"]
        assert "HttpOnly" in cookie
        assert "SameSite=strict" in cookie
        assert "webstorage_session=" in cookie
        assert login.json()["username"] == "warehouse-admin"

        current = await client.get("/api/v1/me")
        assert current.status_code == 200, current.text
        assert current.json()["subject"] == "warehouse-admin"

        async with sessions() as session:
            stored_session = (await session.execute(select(AuthSession))).scalar_one()
            assert stored_session.token_hash not in cookie
            await set_user_password(
                session,
                username="warehouse-admin",
                password="a different secure password",
            )

        revoked = await client.get("/api/v1/me")
        assert revoked.status_code == 401
        old_password = await client.post(
            "/api/v1/auth/login",
            json={
                "username": "warehouse-admin",
                "password": "correct horse battery staple",
            },
        )
        assert old_password.status_code == 401
        new_password = await client.post(
            "/api/v1/auth/login",
            json={
                "username": "warehouse-admin",
                "password": "a different secure password",
            },
        )
        assert new_password.status_code == 200

        logout = await client.post("/api/v1/auth/logout")
        assert logout.status_code == 204
        assert (await client.get("/api/v1/me")).status_code == 401

        async with sessions() as session:
            stored_user = (
                await session.execute(
                    select(UserAccount).where(UserAccount.username == "warehouse-admin")
                )
            ).scalar_one()
            assert stored_user.last_login_at is not None
    finally:
        monkeypatch.setenv("AUTH_DISABLED", "true")
        get_settings.cache_clear()
