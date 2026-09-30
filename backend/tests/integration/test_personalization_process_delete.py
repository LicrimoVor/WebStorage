import uuid

from app.core.security import Actor, Role, get_current_actor
from app.main import app
from app.modules.auth.service import create_user
from app.modules.technological_processes.model import TechnologicalProcessVersion
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from tests.integration.test_technological_processes import create_item, create_process


async def test_archived_product_can_be_reused_and_deleted_process_is_hidden(
    client: AsyncClient,
    database_engine: AsyncEngine,
) -> None:
    product = await create_item(client, name="Product")
    old = await create_process(client, name="Recipe", output_item_id=product["id"])
    payload = {"name": "Recipe", "output_item_id": product["id"]}
    assert (await client.post("/api/v1/technological-processes", json=payload)).status_code == 409
    assert (
        await client.post(f"/api/v1/technological-processes/{old['process']['id']}/archive")
    ).status_code == 200
    new = await create_process(client, name="Recipe", output_item_id=product["id"])
    assert (
        await client.delete(f"/api/v1/technological-processes/{new['process']['id']}")
    ).status_code == 204
    assert (
        await client.get(f"/api/v1/technological-processes/{new['process']['id']}")
    ).status_code == 404
    listed = (await client.get("/api/v1/technological-processes?include_archived=true")).json()
    assert [item["id"] for item in listed["items"]] == [old["process"]["id"]]
    await create_process(client, name="Recipe", output_item_id=product["id"])
    async with async_sessionmaker(database_engine)() as session:
        version = await session.scalar(
            select(TechnologicalProcessVersion).where(
                TechnologicalProcessVersion.process_id == uuid.UUID(new["process"]["id"]),
            )
        )
        assert version is not None and version.status == "archived"


async def test_palettes_are_private_persisted_and_validated(
    client: AsyncClient,
    database_engine: AsyncEngine,
) -> None:
    async with async_sessionmaker(database_engine, expire_on_commit=False)() as session:
        for name in ["first-user", "second-user"]:
            await create_user(
                session, username=name, password="example secure password", roles=[Role.USER]
            )
    palette = {
        "accent": "#2244cc",
        "link": "#1155cc",
        "background": "#eeeeee",
        "surface": "#ffffff",
    }
    app.dependency_overrides[get_current_actor] = lambda: Actor(
        "first-user", frozenset({Role.USER})
    )
    try:
        saved = await client.put("/api/v1/auth/appearance", json={"light": palette})
        assert saved.status_code == 200, saved.text
        assert (await client.get("/api/v1/auth/appearance")).json()["light"] == palette
        invalid = await client.put(
            "/api/v1/auth/appearance", json={"light": {**palette, "accent": "red;display:none"}}
        )
        assert invalid.status_code == 422
        app.dependency_overrides[get_current_actor] = lambda: Actor(
            "second-user", frozenset({Role.USER})
        )
        assert (await client.get("/api/v1/auth/appearance")).json()["light"] is None
        app.dependency_overrides[get_current_actor] = lambda: Actor(
            "first-user", frozenset({Role.USER})
        )
        assert (await client.get("/api/v1/auth/appearance")).json()["light"] == palette
        assert (await client.put("/api/v1/auth/appearance", json={})).status_code == 200
        assert (await client.get("/api/v1/auth/appearance")).json()["light"] is None
    finally:
        app.dependency_overrides.pop(get_current_actor, None)
