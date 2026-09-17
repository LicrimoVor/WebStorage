import asyncio
import uuid
from decimal import Decimal

from httpx import AsyncClient


async def post(client: AsyncClient, path: str, payload: dict, key: str | None = None) -> dict:
    response = await client.post(
        "/api/v1" + path, json=payload, headers={"Idempotency-Key": key or str(uuid.uuid4())}
    )
    assert response.status_code in (200, 201), response.text
    return response.json()


async def setup_catalog(client: AsyncClient) -> tuple[dict, dict, dict, dict]:
    source = await post(client, "/funding-sources", {"name": "Основной счёт"})
    material = await post(client, "/materials", {"name": "Сталь", "unit": "kg", "price": "10"})
    product = await post(
        client, "/manufactured-items", {"name": "Изделие", "unit": "pcs", "is_product": True}
    )
    operation = await post(
        client, "/operations", {"name": "Сборка", "price_per_operation": "5", "time_norm": "10"}
    )
    return source, material, product, operation


async def receipt(client: AsyncClient, source: dict, material: dict) -> dict:
    return await post(
        client,
        "/warehouse/receipts",
        {
            "funding_source_id": source["id"],
            "occurred_at": "2026-09-17T10:00:00Z",
            "comment": "Поставка",
            "entries": [
                {
                    "material_id": material["id"],
                    "quantity": "10",
                    "defective_quantity": "2",
                    "unit_price": "12",
                }
            ],
        },
    )


async def test_receipt_repair_finance_history_and_retries(client: AsyncClient) -> None:
    source, material, _, operation = await setup_catalog(client)
    await receipt(client, source, material)
    stock = (await client.get(f"/api/v1/materials/{material['id']}")).json()
    assert Decimal(stock["free_quantity"]) == 8
    payload = {
        "funding_source_id": source["id"],
        "occurred_at": "2026-09-17T11:00:00Z",
        "serial_number": "N1",
        "replacement_serial_number": "N2",
        "comment": "Замена узла",
        "materials": [{"material_id": material["id"], "quantity": "3"}],
        "operations": [{"operation_id": operation["id"], "quantity": "2"}],
        "service_cost": "25",
    }
    key = str(uuid.uuid4())
    first, retry = await asyncio.gather(
        post(client, "/repairs", payload, key), post(client, "/repairs", payload, key)
    )
    assert first["id"] == retry["id"]
    assert first["operation_snapshots"][0]["name"] == operation["name"]
    stock = (await client.get(f"/api/v1/materials/{material['id']}")).json()
    assert Decimal(stock["free_quantity"]) == 5
    summary = (await client.get("/api/v1/finance/summary")).json()
    assert Decimal(summary["material_expense"]) == 120
    assert Decimal(summary["repair_expense"]) == 25
    assert Decimal(summary["total_expense"]) == 145
    entries = (await client.get("/api/v1/finance/entries")).json()["items"]
    assert all(row["funding_source_id"] == source["id"] for row in entries)
    copied = await post(
        client, "/repairs", {**payload, "copied_from_id": first["id"], "serial_number": "N3"}
    )
    assert copied["copied_from_id"] == first["id"]
    failed = await client.post(
        "/api/v1/repairs", json=payload, headers={"Idempotency-Key": str(uuid.uuid4())}
    )
    assert failed.status_code == 409
    history = (await client.get("/api/v1/business-documents?kind=repair")).json()
    assert len(history) == 2


async def test_hierarchy_ownership_and_recipe_conflicts(client: AsyncClient) -> None:
    _, material, product, _ = await setup_catalog(client)
    parent = await post(client, "/inventory-groups", {"name": "Металлы"})
    child = await post(client, "/inventory-groups", {"name": "Сталь", "parent_id": parent["id"]})
    invalid = await client.post(
        "/api/v1/inventory-groups", json={"name": "Третий уровень", "parent_id": child["id"]}
    )
    assert invalid.status_code == 422
    await client.patch(f"/api/v1/materials/{material['id']}", json={"group_ids": [child["id"]]})
    filtered = (await client.get(f"/api/v1/materials?group_id={parent['id']}")).json()
    assert filtered["total"] == 1
    missing = await client.post(
        "/api/v1/manufactured-items",
        json={"name": "Без продукта", "unit": "pcs", "is_product": False},
    )
    assert missing.status_code == 422
    semi = await post(
        client,
        "/manufactured-items",
        {"name": "Узел", "unit": "pcs", "is_product": False, "product_id": product["id"]},
    )
    graph = {
        "name": "Рецепт",
        "outputItemId": product["id"],
        "nodes": [
            {"id": "m", "type": "material", "referenceId": material["id"]},
            {"id": "s", "type": "manufactured_item", "referenceId": semi["id"]},
            {"id": "o", "type": "output", "referenceId": product["id"]},
        ],
        "edges": [
            {"id": "a", "source": "m", "target": "s", "quantity": "1"},
            {"id": "b", "source": "s", "target": "o", "quantity": "1"},
        ],
    }
    imported = await post(client, "/technological-processes/import", graph)
    duplicate = await client.post(
        "/api/v1/technological-processes/import",
        json={**graph, "name": "Другой", "outputItemId": None},
    )
    assert duplicate.status_code == 409
    graph["nodes"].append({"id": "s2", "type": "manufactured_item", "referenceId": semi["id"]})
    invalid = await client.put(
        f"/api/v1/technological-processes/{imported['process']['id']}/versions/{imported['version']['id']}/graph",
        json=graph,
    )
    assert invalid.status_code == 409


async def test_serialized_release_sale_and_atomic_failures(client: AsyncClient) -> None:
    source, material, product, operation = await setup_catalog(client)
    await receipt(client, source, material)
    graph = {
        "name": "Сборка",
        "outputItemId": product["id"],
        "nodes": [
            {"id": "m", "type": "material", "referenceId": material["id"]},
            {"id": "o", "type": "output", "referenceId": product["id"]},
        ],
        "edges": [{"id": "a", "source": "m", "target": "o", "quantity": "1"}],
    }
    process = await post(client, "/technological-processes/import", graph)
    response = await client.post(
        f"/api/v1/technological-processes/{process['process']['id']}/versions/{process['version']['id']}/activate"
    )
    assert response.status_code == 200, response.text
    path = f"/manufactured-items/{product['id']}/produce"
    payload = {"quantity": "2", "serial_numbers": ["N1", "N2"]}
    key = str(uuid.uuid4())
    first = await post(client, path, payload, key)
    retry = await post(client, path, payload, key)
    assert first["id"] == retry["id"]
    conflict = await client.post(
        "/api/v1" + path,
        json={**payload, "serial_numbers": ["N3", "N4"]},
        headers={"Idempotency-Key": key},
    )
    assert conflict.status_code == 409
    conflict = await client.post(
        "/api/v1" + path, json=payload, headers={"Idempotency-Key": str(uuid.uuid4())}
    )
    assert conflict.status_code == 409
    units = (await client.get("/api/v1/product-units")).json()
    assert len(units) == 2
    sale_payload = {
        "product_id": product["id"],
        "quantity": "1",
        "unit_price": "200",
        "funding_source_id": source["id"],
        "serial_numbers": ["N1"],
    }
    await post(client, "/sales", sale_payload)
    duplicate = await client.post(
        "/api/v1/sales", json=sale_payload, headers={"Idempotency-Key": str(uuid.uuid4())}
    )
    assert duplicate.status_code == 409
    summary = (await client.get("/api/v1/finance/summary")).json()
    assert Decimal(summary["sales_income"]) == 200
    assert Decimal(summary["material_expense"]) == 120
    assert Decimal(summary["balance"]) == 80
    missing_source = await client.post(
        "/api/v1/finance/transactions",
        json={"transaction_type": "expense", "amount": "1", "category": "Тест"},
    )
    assert missing_source.status_code == 422

    await post(
        client,
        "/repairs",
        {
            "funding_source_id": source["id"],
            "occurred_at": "2026-09-17T12:00:00Z",
            "serial_number": "N1",
            "replacement_serial_number": "N2",
            "comment": "Гарантия",
            "materials": [{"material_id": material["id"], "quantity": "1"}],
            "operations": [{"operation_id": operation["id"], "quantity": "1"}],
        },
    )
    stock = (await client.get(f"/api/v1/manufactured-items/{product['id']}")).json()
    assert Decimal(stock["free_quantity"]) == 0
    units = (await client.get("/api/v1/product-units")).json()
    assert next(unit for unit in units if unit["serial_number"] == "N2")["issued_for_repair_id"]
    empty_source = await post(client, "/funding-sources", {"name": "Другой счёт"})
    filtered = (
        await client.get(
            "/api/v1/finance/summary", params={"funding_source_id": empty_source["id"]}
        )
    ).json()
    assert Decimal(filtered["total_income"]) == Decimal(filtered["total_expense"]) == 0
