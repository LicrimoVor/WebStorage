from decimal import Decimal
from typing import Any

import pytest
from app.core.database import engine
from httpx import AsyncClient
from sqlalchemy import event


async def create_analytics_scenario(client: AsyncClient) -> dict[str, Any]:
    material_response = await client.post(
        "/api/v1/materials",
        json={
            "name": "Analytics steel",
            "unit": "kg",
            "initial_quantity": "5",
            "price": "2",
        },
    )
    assert material_response.status_code == 201, material_response.text
    material = material_response.json()
    product_response = await client.post(
        "/api/v1/manufactured-items",
        json={
            "name": "Analytics product",
            "is_product": True,
            "unit": "pcs",
            "initial_quantity": "0",
        },
    )
    assert product_response.status_code == 201, product_response.text
    product = product_response.json()

    process_response = await client.post(
        "/api/v1/technological-processes",
        json={"name": "Analytics process", "output_item_id": product["id"]},
    )
    assert process_response.status_code == 201, process_response.text
    process = process_response.json()
    process_id = process["process"]["id"]
    version_id = process["version"]["id"]
    graph_response = await client.put(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/graph",
        json={
            "schemaVersion": 1,
            "name": "Analytics process",
            "outputItemId": product["id"],
            "nodes": [
                {
                    "id": "material",
                    "type": "material",
                    "referenceId": material["id"],
                    "label": "Steel",
                    "position": {"x": -100, "y": 0},
                },
                {
                    "id": "output",
                    "type": "output",
                    "referenceId": product["id"],
                    "label": "Product",
                    "position": {"x": 100, "y": 0},
                },
            ],
            "edges": [
                {
                    "id": "material-output",
                    "source": "material",
                    "target": "output",
                    "quantity": "2",
                }
            ],
        },
    )
    assert graph_response.status_code == 200, graph_response.text
    activation = await client.post(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/activate"
    )
    assert activation.status_code == 200, activation.text
    plan_response = await client.post(
        "/api/v1/production-plans",
        json={"product_id": product["id"], "planned_quantity": "5"},
    )
    assert plan_response.status_code == 201, plan_response.text
    plan = plan_response.json()
    production = await client.post(
        f"/api/v1/production-plans/{plan['id']}/production-records",
        headers={"Idempotency-Key": "analytics-production"},
        json={"item_id": product["id"], "quantity": "2"},
    )
    assert production.status_code == 201, production.text

    sale = await client.post(
        "/api/v1/sales",
        headers={"Idempotency-Key": "analytics-sale"},
        json={
            "product_id": product["id"],
            "quantity": "1",
            "unit_price": "12",
            "sold_at": "2026-08-20T08:00:00Z",
        },
    )
    assert sale.status_code == 201, sale.text
    employee_response = await client.post(
        "/api/v1/employees", json={"full_name": "Analytics worker"}
    )
    operation_response = await client.post(
        "/api/v1/operations",
        json={
            "name": "Analytics assembly",
            "time_norm": "30",
            "price_per_operation": "10",
        },
    )
    assert employee_response.status_code == operation_response.status_code == 201
    employee = employee_response.json()
    operation = operation_response.json()
    work = await client.post(
        f"/api/v1/operations/{operation['id']}/work-entries",
        json={
            "employee_id": employee["id"],
            "input_mode": "quantity",
            "input_value": "3",
            "performed_at": "2026-08-20T09:00:00Z",
        },
    )
    assert work.status_code == 201, work.text
    payment = await client.post(
        f"/api/v1/employees/{employee['id']}/payments",
        json={"amount": "20", "paid_at": "2026-08-20T10:00:00Z"},
    )
    assert payment.status_code == 201, payment.text
    return {"material": material, "product": product, "employee": employee}


def dashboard_params() -> dict[str, str]:
    return {
        "date_from": "2026-01-01T00:00:00Z",
        "date_to": "2026-12-31T23:59:59Z",
        "bucket": "month",
    }


@pytest.mark.asyncio
async def test_dashboard_aggregates_all_operational_sections(
    client: AsyncClient,
) -> None:
    scenario = await create_analytics_scenario(client)
    response = await client.get("/api/v1/analytics/dashboard", params=dashboard_params())
    assert response.status_code == 200, response.text
    body = response.json()

    production = body["production"]
    assert Decimal(production["produced_products"]) == Decimal("2")
    assert production["production_records"] == 1
    assert production["plans"] == 1
    assert Decimal(production["plan_completion_percent"]) == Decimal("40")
    assert Decimal(production["completed_operations"]) == Decimal("3")
    assert Decimal(production["person_hours"]) == Decimal("1.5")

    sales = body["sales"]
    assert Decimal(sales["sold_quantity"]) == Decimal("1")
    assert Decimal(sales["revenue"]) == Decimal("12")
    assert Decimal(sales["average_unit_price"]) == Decimal("12")
    assert Decimal(sales["current_product_stock"]) == Decimal("1")
    assert sales["by_product"][0]["product_id"] == scenario["product"]["id"]

    warehouse = body["warehouse"]
    assert Decimal(warehouse["current_material_stock_value"]) == Decimal("2")
    assert warehouse["material_deficit_positions"] == 1
    assert Decimal(warehouse["material_deficit_quantity"]) == Decimal("5")
    assert Decimal(warehouse["material_outflow"]) == Decimal("4")
    assert warehouse["demanded_materials"][0]["material_id"] == scenario["material"]["id"]

    personnel = body["personnel"]
    assert Decimal(personnel["accrued"]) == Decimal("30")
    assert Decimal(personnel["paid"]) == Decimal("20")
    assert Decimal(personnel["payable_current"]) == Decimal("10")
    assert personnel["by_employee"][0]["employee_id"] == scenario["employee"]["id"]


@pytest.mark.asyncio
async def test_dashboard_period_boundaries_and_validation(client: AsyncClient) -> None:
    await create_analytics_scenario(client)
    included = await client.get(
        "/api/v1/analytics/dashboard",
        params={
            "date_from": "2026-08-20T08:00:00Z",
            "date_to": "2026-08-20T08:00:00Z",
        },
    )
    assert included.status_code == 200, included.text
    assert Decimal(included.json()["sales"]["revenue"]) == Decimal("12")
    excluded = await client.get(
        "/api/v1/analytics/dashboard",
        params={
            "date_from": "2026-08-20T08:00:01Z",
            "date_to": "2026-08-20T08:59:59Z",
        },
    )
    assert Decimal(excluded.json()["sales"]["revenue"]) == Decimal("0")
    invalid = await client.get(
        "/api/v1/analytics/dashboard",
        params={
            "date_from": "2026-08-21T00:00:00Z",
            "date_to": "2026-08-20T00:00:00Z",
        },
    )
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_dashboard_has_bounded_database_query_count(client: AsyncClient) -> None:
    await create_analytics_scenario(client)
    select_count = 0
    context_count = 0

    def count_selects(*args: Any) -> None:
        nonlocal select_count, context_count
        statement = str(args[2]).lstrip().upper()
        if statement.startswith("SELECT SET_CONFIG("):
            context_count += 1
            return
        if statement.startswith(("SELECT", "WITH")):
            select_count += 1

    event.listen(engine.sync_engine, "before_cursor_execute", count_selects)
    try:
        response = await client.get(
            "/api/v1/analytics/dashboard", params=dashboard_params()
        )
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", count_selects)
    assert response.status_code == 200, response.text
    assert select_count <= 11
    assert context_count <= 1  # One transaction-local audit context, independent of row count.
