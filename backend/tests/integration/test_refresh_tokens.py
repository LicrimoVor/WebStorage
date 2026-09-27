from datetime import UTC, datetime, timedelta

import pytest
from app.core.config import get_settings
from app.core.security import Role
from app.modules.audit.model import AuditEvent
from app.modules.auth.model import AuthSession
from app.modules.auth.service import create_user
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker


@pytest.mark.asyncio
async def test_refresh_expiry_token_separation_and_revocation(
    client: AsyncClient,
    database_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sessions = async_sessionmaker(database_engine, expire_on_commit=False)
    async with sessions() as session:
        await create_user(
            session, username="refresh-user", password="test-password", roles=[Role.ADMIN]
        )
    monkeypatch.setenv("AUTH_DISABLED", "false")
    get_settings.cache_clear()
    try:
        pair = (
            await client.post(
                "/api/v1/auth/login",
                json={
                    "username": "refresh-user",
                    "password": "test-password",
                },
            )
        ).json()
        client.headers["Authorization"] = f"Bearer {pair['refresh_token']}"
        async with sessions() as session:
            events = (
                await session.scalars(
                    select(AuditEvent).where(AuditEvent.entity == "auth_sessions")
                )
            ).all()
            assert events
            for event in events:
                assert "refresh_hash" not in (event.after or {})
                assert "token_hash" not in (event.after or {})
        assert (await client.get("/api/v1/me")).status_code == 401
        assert (
            await client.post(
                "/api/v1/auth/refresh",
                json={
                    "refresh_token": pair["access_token"],
                },
            )
        ).status_code == 401
        async with sessions() as session:
            stored = (await session.scalars(select(AuthSession))).one()
            stored.access_expires_at = datetime.now(UTC) - timedelta(seconds=1)
            await session.commit()
        client.headers["Authorization"] = f"Bearer {pair['access_token']}"
        assert (await client.get("/api/v1/me")).status_code == 401
        refreshed = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]}
        )
        assert refreshed.status_code == 200
        assert refreshed.json()["access_token"] != pair["access_token"]
        client.headers["Authorization"] = f"Bearer {refreshed.json()['access_token']}"
        assert (await client.get("/api/v1/me")).status_code == 200
        client.headers.pop("Authorization")
        assert (
            await client.post("/api/v1/auth/logout", json={"refresh_token": pair["refresh_token"]})
        ).status_code == 204
        assert (
            await client.post("/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]})
        ).status_code == 401
        client.headers["Authorization"] = f"Bearer {refreshed.json()['access_token']}"
        assert (await client.get("/api/v1/me")).status_code == 401
        pair = (
            await client.post(
                "/api/v1/auth/login",
                json={
                    "username": "refresh-user",
                    "password": "test-password",
                },
            )
        ).json()
        async with sessions() as session:
            stored = (await session.scalars(select(AuthSession))).one()
            stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            await session.commit()
        assert (
            await client.post("/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]})
        ).status_code == 401
    finally:
        get_settings.cache_clear()
