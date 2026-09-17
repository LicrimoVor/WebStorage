import io
import uuid
import zipfile
from decimal import Decimal
from xml.etree import ElementTree

import pytest
from app.core.security import Actor, Role, get_current_actor
from app.main import app
from app.modules.audit.model import AuditEvent
from app.modules.auth.service import create_user
from app.modules.materials.model import Material
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from tests.integration.helpers import funding_source


async def make_plan(client: AsyncClient, material_id: str, quantity: str) -> str:
    product = await client.post("/api/v1/manufactured-items", json={
        "name": f"Product {uuid.uuid4()}", "unit": "pcs", "is_product": True,
    })
    assert product.status_code == 201, product.text
    item_id = product.json()["id"]
    process = await client.post("/api/v1/technological-processes", json={
        "name": f"Process {uuid.uuid4()}", "output_item_id": item_id,
    })
    assert process.status_code == 201, process.text
    process_id = process.json()["process"]["id"]
    version_id = process.json()["version"]["id"]
    url = f"/api/v1/technological-processes/{process_id}/versions/{version_id}"
    graph = await client.put(f"{url}/graph", json={
        "name": process.json()["process"]["name"],
        "outputItemId": item_id,
        "nodes": [
            {"id": "input", "type": "material", "referenceId": material_id,
             "label": "Material", "position": {"x": 0, "y": 0}},
            {"id": "output", "type": "output", "referenceId": item_id,
             "label": "Product", "position": {"x": 200, "y": 0}},
        ],
        "edges": [{"id": "edge", "source": "input", "target": "output", "quantity": "2"}],
    })
    assert graph.status_code == 200, graph.text
    active = await client.post(f"{url}/activate")
    assert active.status_code == 200, active.text
    plan = await client.post("/api/v1/production-plans", json={
        "product_id": item_id, "planned_quantity": quantity,
    })
    assert plan.status_code == 201, plan.text
    return str(plan.json()["id"])


async def test_procurement_aggregates_stock_once_and_exports_all_filtered_rows(
    client: AsyncClient,
) -> None:
    material = await client.post(
        "/api/v1/materials",
        json={
            "name": "Brass",
            "unit": "kg",
            "initial_quantity": "3",
            "price": "1.23",
        },
    )
    material_id = material.json()["id"]
    await make_plan(client, material_id, "3")
    await make_plan(client, material_id, "2")
    unpriced = await client.post("/api/v1/materials", json={"name": "Zinc", "unit": "kg"})
    zinc_plan = await make_plan(client, unpriced.json()["id"], "1")
    response = await client.get("/api/v1/procurement", params={"page_size": 1})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["total"] == 2 and result["pages"] == 2
    assert result["unpriced_positions"] == 1
    assert Decimal(result["known_cost"]) == Decimal("8.61")
    brass = result["items"][0]
    assert brass["name"] == "Brass"
    assert Decimal(brass["purchase_quantity"]) == 7
    assert brass["active_plans"] == 2
    second = await client.get("/api/v1/procurement", params={"page_size": 1, "page": 2})
    assert second.json()["items"][0]["estimated_cost"] is None

    export = await client.get("/api/v1/exports/procurement.xlsx")
    assert export.status_code == 200, export.text
    with zipfile.ZipFile(io.BytesIO(export.content)) as archive:
        sheet = ElementTree.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    assert len(sheet.findall(".//s:row", ns)) == 3
    assert Decimal(sheet.find(".//s:c[@r='E2']/s:v", ns).text) == 7  # type: ignore[union-attr,arg-type]
    assert Decimal(sheet.find(".//s:c[@r='G2']/s:v", ns).text) == Decimal("8.61")  # type: ignore[union-attr,arg-type]
    filtered = await client.get("/api/v1/exports/procurement.xlsx", params={"search": "Zinc"})
    with zipfile.ZipFile(io.BytesIO(filtered.content)) as archive:
        xml = archive.read("xl/worksheets/sheet1.xml").decode()
    assert "Zinc" in xml and "Brass" not in xml

    receipt = await client.post(
        f"/api/v1/materials/{material_id}/movements",
        json={
            "funding_source_id": await funding_source(client),
            "movement_type": "receipt",
            "quantity": "7",
        },
    )
    assert receipt.status_code == 201, receipt.text
    updated = await client.get("/api/v1/procurement", params={"search": "Brass"})
    assert updated.json()["total"] == 0
    cancelled = await client.patch(
        f"/api/v1/production-plans/{zinc_plan}",
        json={
            "status": "cancelled",
        },
    )
    assert cancelled.status_code == 200
    assert (await client.get("/api/v1/procurement")).json()["total"] == 0


async def test_audit_persists_changes_requests_and_rolls_back_with_data(
    client: AsyncClient, database_engine: AsyncEngine,
) -> None:
    created = await client.post("/api/v1/materials", json={"name": "Before", "unit": "kg"})
    material_id = created.json()["id"]
    changed = await client.patch(f"/api/v1/materials/{material_id}", json={"name": "After"})
    assert changed.status_code == 200
    response = await client.get("/api/v1/audit-events", params={"search": material_id})
    assert response.status_code == 200, response.text
    events = response.json()["items"]
    change = next(event for event in events if event["action"] == "update")
    assert change["before"]["name"] == "Before"
    assert change["after"]["name"] == "After"
    assert change["actor"] == "local-development"
    linked = await client.get("/api/v1/audit-events", params={"search": change["request_id"]})
    assert any(event["status_code"] == 200 for event in linked.json()["items"])
    first = (await client.get("/api/v1/audit-events", params={"page_size": 1})).json()
    second = (await client.get("/api/v1/audit-events", params={
        "page_size": 1, "page": 2, "through_id": first["through_id"],
    })).json()
    assert first["total"] == second["total"]
    assert first["items"][0]["id"] != second["items"][0]["id"]

    sessions = async_sessionmaker(database_engine)
    async with sessions() as session:
        await session.execute(update(Material).where(Material.id == uuid.UUID(material_id))
                              .values(name="Rolled back"))
        await session.rollback()
    async with sessions() as session:
        rows = (await session.execute(select(AuditEvent).where(
            AuditEvent.entity_id == material_id,
        ))).scalars().all()
        assert all(not row.after or row.after.get("name") != "Rolled back" for row in rows)
        with pytest.raises(DBAPIError):
            await session.execute(update(AuditEvent).values(actor="tampered"))
        await session.rollback()


async def test_audit_excludes_credentials_and_checks_permissions(
    client: AsyncClient, database_engine: AsyncEngine,
) -> None:
    sessions = async_sessionmaker(database_engine, expire_on_commit=False)
    async with sessions() as session:
        await create_user(session, username="audit-admin", password="safe-test-password",
                          roles=[Role.ADMIN])
    success = await client.post("/api/v1/auth/login", json={
        "username": "audit-admin", "password": "safe-test-password",
    })
    assert success.status_code == 200
    await client.get("/api/v1/public/instructions/do-not-store-this-token")
    all_events = await client.get("/api/v1/audit-events", params={"page_size": 100})
    for secret in ("safe-test-password", "password_hash", "token_hash", "$argon2",
                   "do-not-store-this-token"):
        assert secret not in all_events.text
    assert any(event["actor"] == "audit-admin" for event in all_events.json()["items"])
    rejected = await client.post("/api/v1/auth/login", json={
        "username": "unknown-person", "password": "never-log-this-password",
    })
    assert rejected.status_code == 401
    response = await client.get("/api/v1/audit-events", params={"action": "request"})
    assert "never-log-this-password" not in response.text
    assert any(event["status_code"] == 401 for event in response.json()["items"])
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_current_actor] = lambda: Actor(
        subject="operator", roles=frozenset({Role.PRODUCTION}),
    )
    try:
        for url in ("/api/v1/audit-events", "/api/v1/procurement",
                    "/api/v1/exports/procurement.xlsx"):
            assert (await client.get(url)).status_code == 403
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
