import asyncio
import uuid
from decimal import Decimal

from httpx import AsyncClient
from tests.integration.test_business_workflows import post, receipt, setup_catalog


async def test_release_assigns_exact_ids_without_production_and_is_idempotent(
    client: AsyncClient,
) -> None:
    source, _, _, _ = await setup_catalog(client)
    product = await post(
        client,
        "/manufactured-items",
        {
            "name": "Продукция для выпуска",
            "unit": "шт",
            "is_product": True,
            "initial_quantity": "2",
        },
    )
    ids = ["  № А/б;| α 😀  ", "ID:#2?*=<>[]{}"]
    payload = {"product_id": product["id"], "serial_numbers": ids}
    key = str(uuid.uuid4())
    first, retry = await asyncio.gather(
        post(client, "/product-releases", payload, key),
        post(client, "/product-releases", payload, key),
    )
    assert first["id"] == retry["id"]
    units = (await client.get(f"/api/v1/product-units?product_id={product['id']}")).json()
    assert {unit["serial_number"] for unit in units} == set(ids)
    item = (await client.get(f"/api/v1/manufactured-items/{product['id']}")).json()
    assert Decimal(item["free_quantity"]) == 0
    movements = (await client.get(f"/api/v1/manufactured-items/{product['id']}/movements")).json()
    assert len(movements["items"]) == 1  # Initial stock only; release does not produce inventory.
    excess = await client.post(
        "/api/v1/product-releases",
        json={**payload, "serial_numbers": ["extra"]},
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    assert excess.status_code == 409
    await post(
        client,
        "/sales",
        {
            "product_id": product["id"],
            "quantity": "1",
            "serial_numbers": [ids[0]],
            "unit_price": "1",
            "funding_source_id": source["id"],
        },
    )


async def test_accountable_byproduct_requires_release_but_anonymous_byproduct_can_sell(
    client: AsyncClient,
) -> None:
    source, _, parent, _ = await setup_catalog(client)
    for accountable in [True, False]:
        item = await post(
            client,
            "/manufactured-items",
            {
                "name": f"Побочный {accountable}",
                "unit": "шт",
                "is_product": False,
                "is_byproduct": True,
                "is_accountable": accountable,
                "product_id": parent["id"],
                "initial_quantity": "2",
            },
        )
        sale = {
            "product_id": item["id"],
            "quantity": "1",
            "unit_price": "1",
            "funding_source_id": source["id"],
        }
        response = await client.post(
            "/api/v1/sales", json=sale, headers={"Idempotency-Key": str(uuid.uuid4())}
        )
        assert response.status_code == (422 if accountable else 201), response.text
        if accountable:
            await post(
                client,
                "/product-releases",
                {"product_id": item["id"], "serial_numbers": ["побочный / №1"]},
            )
            await post(client, "/sales", {**sale, "serial_numbers": ["побочный / №1"]})


async def test_released_stock_count_and_ids_exclude_sold_and_repair_units(
    client: AsyncClient,
) -> None:
    source, material, _, operation = await setup_catalog(client)
    await receipt(client, source, material)
    product = await post(
        client,
        "/manufactured-items",
        {"name": "Tracked stock", "is_product": True, "unit": "pcs", "initial_quantity": "5"},
    )
    await post(
        client,
        "/product-releases",
        {"product_id": product["id"], "serial_numbers": ["ID-1", "ID-2", "ID-3"]},
    )

    async def assert_count(expected: int) -> None:
        item = (await client.get(f"/api/v1/manufactured-items/{product['id']}")).json()
        assert item["released_quantity"] == expected
        catalog = (await client.get("/api/v1/warehouse/catalog?kind=product")).json()["items"]
        assert (
            next(row for row in catalog if row["id"] == product["id"])["released_quantity"]
            == expected
        )

    await assert_count(3)
    filtered = (
        await client.get("/api/v1/manufactured-items?released_only=true&page_size=1")
    ).json()
    assert filtered["total"] == 1 and filtered["items"][0]["id"] == product["id"]
    await post(
        client,
        "/sales",
        {
            "product_id": product["id"],
            "quantity": "1",
            "serial_numbers": ["ID-1"],
            "unit_price": "10",
            "funding_source_id": source["id"],
        },
    )
    await assert_count(2)
    await post(
        client,
        "/repairs",
        {
            "funding_source_id": source["id"],
            "occurred_at": "2026-10-15T10:00:00Z",
            "serial_number": "Customer unit",
            "replacement_serial_number": "ID-2",
            "comment": "Replacement",
            "materials": [{"material_id": material["id"], "quantity": "1"}],
            "operations": [{"operation_id": operation["id"], "quantity": "1"}],
            "service_cost": "0",
        },
    )
    await assert_count(1)
    available = (
        await client.get(f"/api/v1/product-units?product_id={product['id']}&available_only=true")
    ).json()
    assert [unit["serial_number"] for unit in available] == ["ID-3"]
    assert len((await client.get(f"/api/v1/product-units?product_id={product['id']}")).json()) == 3
    await post(
        client,
        "/sales",
        {
            "product_id": product["id"],
            "quantity": "1",
            "serial_numbers": ["ID-3"],
            "unit_price": "10",
            "funding_source_id": source["id"],
        },
    )
    await assert_count(0)
    assert (await client.get("/api/v1/manufactured-items?released_only=true")).json()["total"] == 0


async def test_anonymous_stock_sale_can_be_fractional_when_other_units_have_ids(
    client: AsyncClient,
) -> None:
    source, _, parent, _ = await setup_catalog(client)
    product = await post(
        client,
        "/manufactured-items",
        {
            "name": "Anonymous byproduct",
            "is_product": False,
            "is_byproduct": True,
            "product_id": parent["id"],
            "unit": "kg",
            "initial_quantity": "3.5",
        },
    )
    await post(
        client, "/product-releases", {"product_id": product["id"], "serial_numbers": ["reserved"]}
    )
    await post(
        client,
        "/sales",
        {
            "product_id": product["id"],
            "quantity": "1.25",
            "unit_price": "4",
            "funding_source_id": source["id"],
        },
    )
    item = (await client.get(f"/api/v1/manufactured-items/{product['id']}")).json()
    assert item["released_quantity"] == 1 and Decimal(item["free_quantity"]) == Decimal("1.25")
