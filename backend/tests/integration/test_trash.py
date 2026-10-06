from decimal import Decimal

import pytest
from httpx import AsyncClient
from tests.integration.helpers import funding_source


async def restore_kind(client: AsyncClient, kind: str) -> None:
    trash = (await client.get("/api/v1/trash")).json()
    entry = next(row for row in trash["items"] if row["entity_type"] == kind)
    response = await client.post(f"/api/v1/trash/{entry['id']}/restore")
    assert response.status_code == 204, response.text


@pytest.mark.asyncio
async def test_material_delete_restores_same_id_and_stock(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/materials",
        json={
            "name": "Recoverable steel",
            "unit": "kg",
            "initial_quantity": "24.5",
        },
    )
    assert response.status_code == 201, response.text
    material_id = response.json()["id"]
    response = await client.post(f"/api/v1/materials/{material_id}/archive")
    assert response.status_code == 200, response.text
    assert (await client.get("/api/v1/materials")).json()["total"] == 0
    await restore_kind(client, "material")
    items = (await client.get("/api/v1/materials")).json()["items"]
    assert items[0]["id"] == material_id
    assert Decimal(items[0]["free_quantity"]) == Decimal("24.5")


@pytest.mark.asyncio
async def test_finance_delete_and_restore_recalculate_summary(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/finance/transactions",
        json={
            "transaction_type": "income",
            "amount": "100.00",
            "category": "Recoverable income",
            "funding_source_id": await funding_source(client),
            "occurred_at": "2026-10-05T09:00:00Z",
        },
    )
    assert response.status_code == 201, response.text
    entry_id = response.json()["id"]
    before = (await client.get("/api/v1/finance/summary")).json()
    response = await client.delete(f"/api/v1/trash/finance_entry/{entry_id}")
    assert response.status_code == 204, response.text
    assert (await client.get("/api/v1/finance/entries")).json()["total"] == 0
    removed = (await client.get("/api/v1/finance/summary")).json()
    assert removed != before
    await restore_kind(client, "finance_entry")
    assert (await client.get("/api/v1/finance/summary")).json() == before


@pytest.mark.asyncio
async def test_deleted_group_restores_memberships(client: AsyncClient) -> None:
    response = await client.post("/api/v1/inventory-groups", json={"name": "Recoverable group"})
    assert response.status_code == 201, response.text
    group_id = response.json()["id"]
    response = await client.post(
        "/api/v1/materials",
        json={
            "name": "Grouped material",
            "unit": "kg",
            "group_ids": [group_id],
        },
    )
    assert response.status_code == 201, response.text
    material_id = response.json()["id"]
    response = await client.delete(f"/api/v1/inventory-groups/{group_id}")
    assert response.status_code == 204, response.text
    await restore_kind(client, "inventory_group")
    material = (await client.get(f"/api/v1/materials/{material_id}")).json()
    assert [g["id"] for g in material["groups"]] == [group_id]


@pytest.mark.asyncio
async def test_operation_group_restore_reconnects_its_operations(client: AsyncClient) -> None:
    response = await client.post("/api/v1/operation-groups", json={"name": "Workshop"})
    assert response.status_code == 201, response.text
    group_id = response.json()["id"]
    response = await client.post("/api/v1/operations", json={"name": "Cut", "group_id": group_id})
    assert response.status_code == 201, response.text
    operation_id = response.json()["id"]
    response = await client.delete(f"/api/v1/operation-groups/{group_id}")
    assert response.status_code == 204, response.text
    operation = (await client.get(f"/api/v1/operations/{operation_id}")).json()
    assert operation["group_id"] is None
    await restore_kind(client, "operation_group")
    operation = (await client.get(f"/api/v1/operations/{operation_id}")).json()
    assert operation["group_id"] == group_id


@pytest.mark.asyncio
async def test_process_and_plan_restore_the_active_recipe_and_material_demand(
    client: AsyncClient,
) -> None:
    product = (
        await client.post(
            "/api/v1/manufactured-items",
            json={
                "name": "Recoverable product",
                "unit": "pcs",
                "is_product": True,
            },
        )
    ).json()
    material = (
        await client.post(
            "/api/v1/materials",
            json={
                "name": "Recipe material",
                "unit": "kg",
            },
        )
    ).json()
    response = await client.post(
        "/api/v1/technological-processes/import",
        json={
            "name": "Recoverable recipe",
            "outputItemId": product["id"],
            "nodes": [
                {"id": "m", "type": "material", "referenceId": material["id"]},
                {"id": "out", "type": "output", "referenceId": product["id"]},
            ],
            "edges": [{"id": "edge", "source": "m", "target": "out", "quantity": "2"}],
        },
    )
    assert response.status_code == 201, response.text
    imported = response.json()
    process_id, version_id = imported["process"]["id"], imported["version"]["id"]
    response = await client.post(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/activate",
    )
    assert response.status_code == 200, response.text
    assert (await client.delete(f"/api/v1/trash/process/{process_id}")).status_code == 204
    await restore_kind(client, "process")
    process = (await client.get(f"/api/v1/technological-processes/{process_id}")).json()
    assert process["active_version"]["id"] == version_id
    response = await client.post(
        "/api/v1/production-plans",
        json={
            "product_id": product["id"],
            "planned_quantity": "3",
        },
    )
    assert response.status_code == 201, response.text
    plan_id = response.json()["id"]
    required = (await client.get(f"/api/v1/materials/{material['id']}")).json()["required_quantity"]
    assert Decimal(required) == 6
    assert (await client.delete(f"/api/v1/trash/production_plan/{plan_id}")).status_code == 204
    assert (await client.get("/api/v1/production-plans")).json()["total"] == 0
    required = (await client.get(f"/api/v1/materials/{material['id']}")).json()["required_quantity"]
    assert Decimal(required) == 0
    await restore_kind(client, "production_plan")
    required = (await client.get(f"/api/v1/materials/{material['id']}")).json()["required_quantity"]
    assert Decimal(required) == 6


@pytest.mark.asyncio
async def test_purged_financial_entry_stays_deleted_and_cannot_be_restored(
    client: AsyncClient,
) -> None:
    response = await client.post(
        "/api/v1/finance/transactions",
        json={"transaction_type": "income", "amount": "100.00", "category": "Permanent income",
              "funding_source_id": await funding_source(client),
              "occurred_at": "2026-10-05T09:00:00Z"},
    )
    assert response.status_code == 201, response.text
    deleted = await client.delete(f"/api/v1/trash/finance_entry/{response.json()['id']}")
    assert deleted.status_code == 204
    removed_summary = (await client.get("/api/v1/finance/summary")).json()
    entry = (await client.get("/api/v1/trash")).json()["items"][0]
    assert (await client.delete(f"/api/v1/trash/{entry['id']}")).status_code == 204
    assert (await client.get("/api/v1/trash")).json()["total"] == 0
    assert (await client.get("/api/v1/finance/entries")).json()["total"] == 0
    assert (await client.get("/api/v1/finance/summary")).json() == removed_summary
    assert (await client.post(f"/api/v1/trash/{entry['id']}/restore")).status_code == 404
    assert (await client.delete(f"/api/v1/trash/{entry['id']}")).status_code == 404
