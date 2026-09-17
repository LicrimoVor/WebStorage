import asyncio
from decimal import Decimal
from typing import Any

import pytest
from app.core.errors import AuthorizationError
from app.core.security import Actor, Role, require_any_role
from httpx import AsyncClient
from tests.integration.helpers import funding_source


async def create_item(
    client: AsyncClient,
    *,
    name: str,
    is_product: bool = True,
    stock: str = "5",
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/manufactured-items",
        json={
            "name": name,
            "is_product": is_product,
            "unit": "pcs",
            "initial_quantity": stock,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def register_sale(
    client: AsyncClient,
    *,
    product_id: str,
    quantity: str,
    price: str,
    key: str,
    sold_at: str | None = "2026-08-20T08:00:00Z",
) -> Any:
    payload: dict[str, Any] = {
        "funding_source_id": await funding_source(client),
        "product_id": product_id,
        "quantity": quantity,
        "unit_price": price,
        "comment": "Retail",
    }
    if sold_at is not None:
        payload["sold_at"] = sold_at
    return await client.post("/api/v1/sales", headers={"Idempotency-Key": key}, json=payload)


@pytest.mark.asyncio
async def test_sale_atomically_writes_stock_and_finance(client: AsyncClient) -> None:
    product = await create_item(client, name="Finished product")
    response = await register_sale(
        client,
        product_id=product["id"],
        quantity="2",
        price="12.34",
        key="sale-success-1",
    )
    assert response.status_code == 201, response.text
    sale = response.json()
    assert Decimal(sale["total_amount"]) == Decimal("24.68")
    assert Decimal(sale["balance_after"]) == Decimal("3")

    product_read = await client.get(f"/api/v1/manufactured-items/{product['id']}")
    assert Decimal(product_read.json()["free_quantity"]) == Decimal("3")
    movements = await client.get(
        f"/api/v1/manufactured-items/{product['id']}/movements"
    )
    sale_movement = movements.json()["items"][0]
    assert sale_movement["movement_type"] == "sale"
    assert sale_movement["sale_id"] == sale["id"]
    assert sale_movement["source_id"] == sale["id"]

    sales = await client.get("/api/v1/sales")
    assert sales.status_code == 200
    assert sales.json()["total"] == 1
    assert Decimal(sales.json()["filtered_amount"]) == Decimal("24.68")
    summary = await client.get("/api/v1/sales/summary")
    assert summary.status_code == 200
    assert Decimal(summary.json()["total_quantity"]) == Decimal("2")
    finance = await client.get("/api/v1/finance/entries")
    assert finance.status_code == 200, finance.text
    assert finance.json()["items"][0]["source_type"] == "sale"
    assert Decimal(finance.json()["items"][0]["amount"]) == Decimal("24.68")


@pytest.mark.asyncio
async def test_insufficient_stock_rolls_back_sale(client: AsyncClient) -> None:
    product = await create_item(client, name="Limited product", stock="1")
    failed = await register_sale(
        client,
        product_id=product["id"],
        quantity="2",
        price="10",
        key="sale-rollback-1",
    )
    assert failed.status_code == 409, failed.text
    assert (await client.get("/api/v1/sales")).json()["total"] == 0
    product_read = await client.get(f"/api/v1/manufactured-items/{product['id']}")
    assert Decimal(product_read.json()["free_quantity"]) == Decimal("1")
    assert (await client.get("/api/v1/finance/entries")).json()["total"] == 0


@pytest.mark.asyncio
async def test_sale_idempotency_and_concurrent_stock_protection(
    client: AsyncClient,
) -> None:
    product = await create_item(client, name="Concurrent product", stock="5")
    first = await register_sale(
        client,
        product_id=product["id"],
        quantity="1",
        price="10",
        key="sale-replay-1",
        sold_at=None,
    )
    replay = await register_sale(
        client,
        product_id=product["id"],
        quantity="1",
        price="10",
        key="sale-replay-1",
        sold_at=None,
    )
    assert first.status_code == replay.status_code == 201
    assert first.json()["id"] == replay.json()["id"]
    conflict = await register_sale(
        client,
        product_id=product["id"],
        quantity="2",
        price="10",
        key="sale-replay-1",
        sold_at=None,
    )
    assert conflict.status_code == 409

    responses = await asyncio.gather(
        register_sale(
            client,
            product_id=product["id"],
            quantity="3",
            price="10",
            key="sale-concurrent-1",
        ),
        register_sale(
            client,
            product_id=product["id"],
            quantity="3",
            price="10",
            key="sale-concurrent-2",
        ),
    )
    assert sorted(response.status_code for response in responses) == [201, 409]
    product_read = await client.get(f"/api/v1/manufactured-items/{product['id']}")
    assert Decimal(product_read.json()["free_quantity"]) == Decimal("1")
    assert (await client.get("/api/v1/sales")).json()["total"] == 2


@pytest.mark.asyncio
async def test_material_cost_uses_movement_price_snapshot(client: AsyncClient) -> None:
    material = await client.post(
        "/api/v1/materials",
        json={
            "name": "Steel",
            "unit": "kg",
            "initial_quantity": "10",
            "price": "2.50",
        },
    )
    assert material.status_code == 201, material.text
    material_id = material.json()["id"]
    consumed = await client.post(
        f"/api/v1/materials/{material_id}/movements",
        json={
            "movement_type": "receipt",
            "quantity": "2",
            "funding_source_id": await funding_source(client),
        },
    )
    assert consumed.status_code == 201, consumed.text
    assert Decimal(consumed.json()["unit_price_snapshot"]) == Decimal("2.50")
    assert Decimal(consumed.json()["total_amount_snapshot"]) == Decimal("5.00")
    updated = await client.patch(f"/api/v1/materials/{material_id}", json={"price": "4.00"})
    assert updated.status_code == 200

    finance = await client.get("/api/v1/finance/entries", params={"source": "material"})
    assert finance.status_code == 200, finance.text
    assert finance.json()["total"] == 1
    assert Decimal(finance.json()["items"][0]["amount"]) == Decimal("5.00")
    summary = await client.get("/api/v1/finance/summary")
    assert Decimal(summary.json()["material_expense"]) == Decimal("5.00")


@pytest.mark.asyncio
async def test_manual_finance_and_labour_are_aggregated(client: AsyncClient) -> None:
    employee = await client.post("/api/v1/employees", json={"full_name": "Finance Worker"})
    operation = await client.post(
        "/api/v1/operations",
        json={"name": "Finance operation", "price_per_operation": "10"},
    )
    work = await client.post(
        f"/api/v1/operations/{operation.json()['id']}/work-entries",
        json={
            "employee_id": employee.json()["id"],
            "input_mode": "quantity",
            "input_value": "2",
        },
    )
    assert work.status_code == 201, work.text
    payment = await client.post(
        f"/api/v1/employees/{employee.json()['id']}/payments",
        json={"funding_source_id": await funding_source(client), "amount": "15"},
    )
    assert payment.status_code == 201, payment.text
    income = await client.post(
        "/api/v1/finance/transactions",
        json={
            "funding_source_id": await funding_source(client),
            "transaction_type": "income",
            "amount": "100",
            "occurred_at": "2026-08-20T08:00:00Z",
            "category": "Other income",
        },
    )
    expense = await client.post(
        "/api/v1/finance/transactions",
        json={
            "funding_source_id": await funding_source(client),
            "transaction_type": "expense",
            "amount": "30",
            "occurred_at": "2026-08-20T09:00:00Z",
            "category": "Rent",
        },
    )
    assert income.status_code == expense.status_code == 201
    summary = await client.get("/api/v1/finance/summary")
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert Decimal(body["labour_expense"]) == Decimal("15")
    assert Decimal(body["manual_income"]) == Decimal("100")
    assert Decimal(body["manual_expense"]) == Decimal("30")
    assert Decimal(body["total_income"]) == Decimal("100")
    assert Decimal(body["total_expense"]) == Decimal("45")
    assert Decimal(body["balance"]) == Decimal("55")
    filtered = await client.get(
        "/api/v1/finance/entries",
        params={"source": "manual", "direction": "expense"},
    )
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["category"] == "Rent"


def test_finance_permission_guard_rejects_warehouse_role() -> None:
    actor = Actor(subject="warehouse-user", roles=frozenset({Role.WAREHOUSE}))
    with pytest.raises(AuthorizationError):
        require_any_role(actor, Role.FINANCE)
