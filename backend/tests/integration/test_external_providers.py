import asyncio
import uuid
from decimal import Decimal

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
    offer = await post(
        client,
        "/external-offers",
        {
            "provider_id": provider["id"],
            "item_id": semi["id"],
            "money_cost": money_cost,
            "materials": [{"material_id": material["id"], "quantity": "2"}]
            if use_materials
            else [],
        },
    )
    return source, material, semi, provider, offer


async def test_external_offer_creates_operation_and_provider_rename_updates_it(
    client: AsyncClient,
) -> None:
    _, material, semi, provider, offer = await setup_external(client)
    operation = (await client.get(f"/api/v1/operations/{offer['operation_id']}")).json()
    assert operation["name"] == "Обратиться к Подрядчик для Внешний узел"
    assert Decimal(operation["price_per_operation"]) == Decimal("12.50")
    renamed = await client.patch(
        f"/api/v1/external-providers/{provider['id']}", json={"name": "Новый подрядчик"}
    )
    assert renamed.status_code == 200, renamed.text
    assert (await client.get(f"/api/v1/operations/{offer['operation_id']}")).json()[
        "name"
    ] == "Обратиться к Новый подрядчик для Внешний узел"
    duplicate = await client.post(
        "/api/v1/external-offers",
        json={
            "provider_id": provider["id"],
            "item_id": semi["id"],
            "materials": [],
            "money_cost": "1",
        },
    )
    assert duplicate.status_code == 409, duplicate.text
    updated = await client.put(
        f"/api/v1/external-offers/{offer['id']}",
        json={
            "provider_id": provider["id"],
            "item_id": semi["id"],
            "money_cost": "7",
            "materials": [{"material_id": material["id"], "quantity": "1"}],
            "active": False,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["operation_id"] == offer["operation_id"]
    assert (await client.get(f"/api/v1/operations/{offer['operation_id']}")).json()[
        "archived"
    ] is True


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
    source, material, _, provider, offer = await setup_external(client, use_materials=False)
    product_id = (await client.get("/api/v1/manufactured-items?kind=product")).json()["items"][0][
        "id"
    ]
    invalid = await client.post(
        "/api/v1/external-offers", json={"provider_id": provider["id"], "item_id": product_id}
    )
    assert invalid.status_code == 422
    invalid = await client.put(
        f"/api/v1/external-offers/{offer['id']}",
        json={**offer, "materials": [{"material_id": material["id"], "quantity": "1"}] * 2},
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
