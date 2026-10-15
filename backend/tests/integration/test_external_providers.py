import asyncio
import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from tests.integration.test_business_workflows import post, receipt, setup_catalog


async def setup_external(
    client: AsyncClient, money_cost: str = "12.50", use_materials: bool = True
) -> tuple[dict, dict, dict, dict, dict]:
    source, material, product, _ = await setup_catalog(client)
    semi = await post(
        client,
        "/manufactured-items",
        {"name": "Внешний узел", "unit": "шт", "is_product": False, "product_id": product["id"]},
    )
    provider = await post(client, "/external-providers", {"name": "Подрядчик"})
    operation = await post(
        client, "/operations", {"name": "Внешняя обработка", "price_per_operation": money_cost}
    )
    graph = {
        "name": "Техпроцесс исполнителя",
        "outputItemId": semi["id"],
        "nodes": [
            {"id": "op", "type": "operation", "referenceId": operation["id"]},
            {"id": "out", "type": "output", "referenceId": semi["id"]},
        ],
        "edges": [{"id": "work", "source": "op", "target": "out", "quantity": "1"}],
    }
    if use_materials:
        graph["nodes"].append({"id": "m", "type": "material", "referenceId": material["id"]})
        graph["edges"].append({"id": "material", "source": "m", "target": "out", "quantity": "2"})
    process = await post(client, "/technological-processes/import", graph)
    activated = await client.post(
        f"/api/v1/technological-processes/{process['process']['id']}/versions/{process['version']['id']}/activate"
    )
    assert activated.status_code == 200, activated.text
    offer = await post(
        client,
        "/external-offers",
        {"provider_id": provider["id"], "process_id": process["process"]["id"]},
    )
    return source, material, semi, provider, offer


async def test_external_offer_uses_process_without_creating_operations(client: AsyncClient) -> None:
    _, _, _, provider, offer = await setup_external(client)
    before = (await client.get("/api/v1/operations")).json()
    assert not any(row["name"].startswith("Обратиться к") for row in before["items"])
    assert Decimal(offer["money_cost"]) == Decimal("12.50")
    assert Decimal(offer["materials"][0]["quantity"]) == 2
    renamed = await client.patch(
        f"/api/v1/external-providers/{provider['id']}", json={"name": "Новый подрядчик"}
    )
    assert renamed.status_code == 200
    assert (await client.get("/api/v1/operations")).json() == before
    duplicate = await client.post(
        "/api/v1/external-offers",
        json={"provider_id": provider["id"], "process_id": offer["process_id"]},
    )
    assert duplicate.status_code == 409
    updated = await client.put(
        f"/api/v1/external-offers/{offer['id']}",
        json={"provider_id": provider["id"], "process_id": offer["process_id"], "active": False},
    )
    assert updated.status_code == 200
    assert updated.json()["active"] is False


async def test_external_receipt_is_atomic_idempotent_and_records_exact_expense_once(
    client: AsyncClient,
) -> None:
    source, material, semi, provider, offer = await setup_external(client)
    await receipt(client, source, material)
    payload = {
        "offer_id": offer["id"],
        "quantity": "3",
        "funding_source_id": source["id"],
        "occurred_at": "2026-10-14T08:00:00Z",
        "comment": "Заказ",
    }
    key = str(uuid.uuid4())
    first, retry = await asyncio.gather(
        *[
            client.post("/api/v1/external-receipts", json=payload, headers={"Idempotency-Key": key})
            for _ in range(2)
        ]
    )
    assert first.status_code == 201, first.text
    assert retry.status_code == 201, retry.text
    assert first.json()["id"] == retry.json()["id"]
    for operation in (await client.get("/api/v1/operations")).json()["items"]:
        history = await client.get(f"/api/v1/operations/{operation['id']}/work-entries")
        assert history.json()["total"] == 0
    assert len((await client.get("/api/v1/business-documents?kind=receipts")).json()) == 2
    assert first.json()["provider_name"] == provider["name"]
    assert Decimal(first.json()["total_amount"]) == Decimal("37.50")
    assert (
        Decimal((await client.get(f"/api/v1/materials/{material['id']}")).json()["free_quantity"])
        == 2
    )
    assert (
        Decimal(
            (await client.get(f"/api/v1/manufactured-items/{semi['id']}")).json()["free_quantity"]
        )
        == 3
    )
    finances = (await client.get("/api/v1/finance/entries?category=Внешние исполнители")).json()[
        "items"
    ]
    external = [row for row in finances if row["category"] == "Внешние исполнители"]
    assert len(external) == 1
    assert Decimal(external[0]["amount"]) == Decimal("37.50")
    assert len((await client.get("/api/v1/business-documents?kind=external_receipt")).json()) == 1
    conflict = await client.post(
        "/api/v1/external-receipts",
        json={**payload, "quantity": "1"},
        headers={"Idempotency-Key": key},
    )
    assert conflict.status_code == 409
    insufficient = await client.post(
        "/api/v1/external-receipts",
        json={**payload, "quantity": "2"},
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    assert insufficient.status_code == 409, insufficient.text
    assert (
        Decimal((await client.get(f"/api/v1/materials/{material['id']}")).json()["free_quantity"])
        == 2
    )
    assert (
        Decimal(
            (await client.get(f"/api/v1/manufactured-items/{semi['id']}")).json()["free_quantity"]
        )
        == 3
    )
    assert len((await client.get("/api/v1/business-documents?kind=external_receipt")).json()) == 1


async def test_material_only_external_receipt_and_inactive_offer(client: AsyncClient) -> None:
    source, material, semi, _, offer = await setup_external(client, money_cost="0")
    await receipt(client, source, material)
    payload = {
        "offer_id": offer["id"],
        "quantity": "1.5",
        "funding_source_id": source["id"],
        "occurred_at": "2026-10-14T08:00:00Z",
    }
    result = await post(client, "/external-receipts", payload)
    assert Decimal(result["total_amount"]) == 0
    assert (
        Decimal((await client.get(f"/api/v1/materials/{material['id']}")).json()["free_quantity"])
        == 5
    )
    assert Decimal(
        (await client.get(f"/api/v1/manufactured-items/{semi['id']}")).json()["free_quantity"]
    ) == Decimal("1.5")
    finance = (await client.get("/api/v1/finance/entries")).json()["items"]
    assert not [entry for entry in finance if entry["category"] == "Внешние исполнители"]
    assert (
        await client.put(f"/api/v1/external-offers/{offer['id']}", json={**offer, "active": False})
    ).status_code == 200
    rejected = await client.post(
        "/api/v1/external-receipts", json=payload, headers={"Idempotency-Key": str(uuid.uuid4())}
    )
    assert rejected.status_code == 422


async def test_external_offer_rejects_products_duplicate_materials_and_invalid_funding(
    client: AsyncClient,
) -> None:
    source, _material, _, provider, offer = await setup_external(client, use_materials=False)
    product_id = (await client.get("/api/v1/manufactured-items?kind=product")).json()["items"][0][
        "id"
    ]
    invalid = await client.post(
        "/api/v1/external-offers", json={"provider_id": provider["id"], "item_id": product_id}
    )
    assert invalid.status_code == 422
    invalid = await client.put(
        f"/api/v1/external-offers/{offer['id']}",
        json={"provider_id": provider["id"], "process_id": str(uuid.uuid4())},
    )
    assert invalid.status_code == 422
    invalid = await client.post(
        "/api/v1/external-receipts",
        headers={"Idempotency-Key": str(uuid.uuid4())},
        json={
            "offer_id": offer["id"],
            "quantity": "2",
            "funding_source_id": source["id"],
            "occurred_at": "2026-10-14T08:00:00Z",
            "funding_allocations": [{"funding_source_id": source["id"], "amount": "1"}],
        },
    )
    assert invalid.status_code == 422
    assert not (await client.get("/api/v1/business-documents?kind=external_receipt")).json()


async def test_money_only_external_receipt_splits_funding_without_inventory_consumption(
    client: AsyncClient,
) -> None:
    source, material, semi, _, offer = await setup_external(client, use_materials=False)
    other = await post(client, "/funding-sources", {"name": "Другой счёт"})
    result = await post(
        client,
        "/external-receipts",
        {
            "offer_id": offer["id"],
            "quantity": "2",
            "funding_source_id": source["id"],
            "occurred_at": "2026-10-14T08:00:00Z",
            "funding_allocations": [
                {"funding_source_id": source["id"], "amount": "15"},
                {"funding_source_id": other["id"], "amount": "10"},
            ],
        },
    )
    assert Decimal(result["total_amount"]) == 25
    assert result["spent_materials"] == []
    assert (
        Decimal((await client.get(f"/api/v1/materials/{material['id']}")).json()["free_quantity"])
        == 0
    )
    assert (
        Decimal(
            (await client.get(f"/api/v1/manufactured-items/{semi['id']}")).json()["free_quantity"]
        )
        == 2
    )
    rows = (await client.get(f"/api/v1/finance/entries?funding_source_id={other['id']}")).json()[
        "items"
    ]
    assert len(rows) == 1
    assert Decimal(rows[0]["amount"]) == 10


@pytest.mark.parametrize("kind", ["external_provider", "external_offer"])
async def test_external_deletion_restores_from_trash_and_preserves_receipts(
    client: AsyncClient, kind: str
) -> None:
    source, _, _, provider, offer = await setup_external(client, use_materials=False)
    payload = {
        "offer_id": offer["id"],
        "quantity": "1",
        "funding_source_id": source["id"],
        "occurred_at": "2026-10-15T08:00:00Z",
    }
    receipt_key = str(uuid.uuid4())
    original = await post(client, "/external-receipts", payload, receipt_key)
    entity_id = provider["id"] if kind == "external_provider" else offer["id"]
    for _ in range(2):
        deleted = await client.delete(f"/api/v1/trash/{kind}/{entity_id}")
        assert deleted.status_code == 204, deleted.text
    assert (await client.get("/api/v1/external-offers")).json() == []
    providers = (await client.get("/api/v1/external-providers")).json()
    assert len(providers) == (0 if kind == "external_provider" else 1)
    process = await client.get(f"/api/v1/technological-processes/{offer['process_id']}")
    assert process.status_code == 200
    assert process.json()["active_version"]["id"] == offer["process_version_id"]
    blocked = await client.post(
        "/api/v1/external-receipts", json=payload, headers={"Idempotency-Key": str(uuid.uuid4())}
    )
    assert blocked.status_code == 422
    assert (await post(client, "/external-receipts", payload, receipt_key))["id"] == original["id"]
    history = (await client.get("/api/v1/business-documents?kind=external_receipt")).json()
    assert len(history) == 1 and history[0]["provider_name"] == provider["name"]
    entries = (await client.get("/api/v1/trash")).json()["items"]
    entry = next(row for row in entries if row["entity_type"] == kind)
    restored = await client.post(f"/api/v1/trash/{entry['id']}/restore")
    assert restored.status_code == 204, restored.text
    assert (await client.get("/api/v1/external-providers")).json()[0]["id"] == provider["id"]
    assert (await client.get("/api/v1/external-offers")).json()[0]["id"] == offer["id"]
    await post(client, "/external-receipts", payload)


async def test_external_offer_restore_requires_provider_and_respects_separate_deletion(
    client: AsyncClient,
) -> None:
    _, _, _, provider, offer = await setup_external(client, use_materials=False)
    for kind, id in [("external_offer", offer["id"]), ("external_provider", provider["id"])]:
        response = await client.delete(f"/api/v1/trash/{kind}/{id}")
        assert response.status_code == 204
    entries = (await client.get("/api/v1/trash")).json()["items"]
    offer_entry = next(row for row in entries if row["entity_type"] == "external_offer")
    provider_entry = next(row for row in entries if row["entity_type"] == "external_provider")
    blocked = await client.post(f"/api/v1/trash/{offer_entry['id']}/restore")
    assert blocked.status_code == 409
    assert (await client.post(f"/api/v1/trash/{provider_entry['id']}/restore")).status_code == 204
    assert (await client.get("/api/v1/external-offers")).json() == []
    assert (await client.post(f"/api/v1/trash/{offer_entry['id']}/restore")).status_code == 204
    assert (await client.get("/api/v1/external-offers")).json()[0]["id"] == offer["id"]
