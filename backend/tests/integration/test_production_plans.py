from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from tests.integration.helpers import embedded_process, owner_product


async def create_material(
    client: AsyncClient, *, name: str, stock: str, price: str
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/materials",
        json={
            "name": name,
            "unit": "kg",
            "initial_quantity": stock,
            "price": price,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_item(
    client: AsyncClient,
    *,
    name: str,
    is_product: bool,
    stock: str = "0",
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/manufactured-items",
        json={
            "name": name,
            "is_product": is_product,
            "product_id": None if is_product else await owner_product(client),
            "unit": "pcs",
            "initial_quantity": stock,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_operation(client: AsyncClient, *, name: str) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/operations",
        json={"name": name, "time_norm": "30", "price_per_operation": "10"},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def activate_process(
    client: AsyncClient,
    *,
    name: str,
    output: dict[str, Any],
    input_type: str,
    input_id: str,
    input_quantity: str,
    operation_id: str | None = None,
) -> dict[str, Any]:
    created = await client.post(
        "/api/v1/technological-processes",
        json={"name": name, "output_item_id": output["id"]},
    )
    assert created.status_code == 201, created.text
    process_id = created.json()["process"]["id"]
    version_id = created.json()["version"]["id"]
    nodes: list[dict[str, object]] = [
        {
            "id": "input",
            "type": input_type,
            "referenceId": input_id,
            "label": "Input",
            "position": {"x": -200, "y": 0},
        }
    ]
    edges: list[dict[str, object]] = []
    source = "input"
    if operation_id is not None:
        nodes.append(
            {
                "id": "operation",
                "type": "operation",
                "referenceId": operation_id,
                "label": "Operation",
                "position": {"x": 0, "y": 0},
            }
        )
        edges.append(
            {
                "id": "input-operation",
                "source": "input",
                "target": "operation",
                "quantity": input_quantity,
            }
        )
        source = "operation"
        output_quantity = "1"
    else:
        output_quantity = input_quantity
    nodes.append(
        {
            "id": "output",
            "type": "output",
            "referenceId": output["id"],
            "label": output["name"],
            "position": {"x": 200, "y": 0},
        }
    )
    edges.append(
        {
            "id": "source-output",
            "source": source,
            "target": "output",
            "quantity": output_quantity,
        }
    )
    document = {
        "schemaVersion": 1,
        "name": name,
        "outputItemId": output["id"],
        "nodes": nodes,
        "edges": edges,
    }
    saved = await client.put(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/graph",
        json=document,
    )
    assert saved.status_code == 200, saved.text
    activated = await client.post(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/activate"
    )
    assert activated.status_code == 200, activated.text
    return {"process_id": process_id, "version": activated.json()}


@pytest.mark.asyncio
async def test_nested_requirements_use_semi_finished_stock_and_aggregate_cost(
    client: AsyncClient,
) -> None:
    material = await create_material(client, name="Steel", stock="100", price="2.50")
    operation = await create_operation(client, name="Cut")
    product = await create_item(client, name="Frame", is_product=True)
    semi = await create_item(client, name="Blank", is_product=False, stock="4")
    product_process = await embedded_process(
        client,
        product,
        semi,
        [("material", material["id"], "3"), ("operation", operation["id"], "1")],
        "2",
    )
    semi_process = product_process

    response = await client.post(
        "/api/v1/production-plans",
        json={"product_id": product["id"], "planned_quantity": "5"},
    )
    assert response.status_code == 201, response.text
    plan = response.json()
    assert plan["process_version_id"] == product_process["version"]["id"]
    assert Decimal(plan["remaining_quantity"]) == Decimal("5")
    assert Decimal(plan["estimated_cost"]) == Decimal("105")
    assert Decimal(plan["total_required_hours"]) == Decimal("3")
    assert plan["calculation_complete"] is True

    semi_requirement = next(
        item for item in plan["manufactured_items"] if item["manufactured_item_id"] == semi["id"]
    )
    assert Decimal(semi_requirement["required_quantity"]) == Decimal("10")
    assert Decimal(semi_requirement["stock_used_quantity"]) == Decimal("4")
    assert Decimal(semi_requirement["to_produce_quantity"]) == Decimal("6")
    assert Decimal(plan["materials"][0]["required_quantity"]) == Decimal("18")
    assert Decimal(plan["operations"][0]["required_quantity"]) == Decimal("6")

    material_read = await client.get(f"/api/v1/materials/{material['id']}")
    assert Decimal(material_read.json()["required_quantity"]) == Decimal("18")
    semi_read = await client.get(f"/api/v1/manufactured-items/{semi['id']}")
    assert Decimal(semi_read.json()["required_quantity"]) == Decimal("10")
    operation_read = await client.get(f"/api/v1/operations/{operation['id']}")
    assert Decimal(operation_read.json()["required_quantity"]) == Decimal("6")

    next_version = await client.post(
        f"/api/v1/technological-processes/{semi_process['process_id']}/versions",
        json={},
    )
    assert next_version.status_code == 201, next_version.text
    next_document = next_version.json()["graph"]
    next_document["edges"][0]["quantity"] = "5"
    next_version_id = next_version.json()["id"]
    saved = await client.put(
        "/api/v1/technological-processes/"
        f"{semi_process['process_id']}/versions/{next_version_id}/graph",
        json=next_document,
    )
    assert saved.status_code == 200, saved.text
    activated = await client.post(
        "/api/v1/technological-processes/"
        f"{semi_process['process_id']}/versions/{next_version_id}/activate"
    )
    assert activated.status_code == 200, activated.text

    later_plan = await client.post(
        "/api/v1/production-plans",
        json={"product_id": product["id"], "planned_quantity": "1"},
    )
    assert later_plan.status_code == 201, later_plan.text
    assert Decimal(later_plan.json()["materials"][0]["required_quantity"]) == Decimal("10")
    pinned_plan = await client.get(f"/api/v1/production-plans/{plan['id']}")
    assert Decimal(pinned_plan.json()["materials"][0]["required_quantity"]) == Decimal("18")

    explicitly_recalculated = await client.post(
        f"/api/v1/production-plans/{plan['id']}/recalculate",
        json={"use_latest_process_version": True},
    )
    assert explicitly_recalculated.status_code == 200, explicitly_recalculated.text
    assert Decimal(explicitly_recalculated.json()["materials"][0]["required_quantity"]) == Decimal(
        "30"
    )


@pytest.mark.asyncio
async def test_active_plans_allocate_stock_fifo_and_recalculate_after_cancel(
    client: AsyncClient,
) -> None:
    material = await create_material(client, name="Sheet", stock="100", price="1")
    operation = await create_operation(client, name="Stamp")
    product = await create_item(client, name="Box", is_product=True)
    semi = await create_item(client, name="Shell", is_product=False, stock="4")
    await embedded_process(
        client,
        product,
        semi,
        [("material", material["id"], "3"), ("operation", operation["id"], "1")],
        "2",
    )
    first = await client.post(
        "/api/v1/production-plans",
        json={"product_id": product["id"], "planned_quantity": "2"},
    )
    assert first.status_code == 201, first.text
    second = await client.post(
        "/api/v1/production-plans",
        json={"product_id": product["id"], "planned_quantity": "1"},
    )
    assert second.status_code == 201, second.text
    assert Decimal(second.json()["materials"][0]["required_quantity"]) == Decimal("6")

    cancelled = await client.patch(
        f"/api/v1/production-plans/{first.json()['id']}",
        json={"status": "cancelled"},
    )
    assert cancelled.status_code == 200, cancelled.text
    recalculated_second = await client.get(f"/api/v1/production-plans/{second.json()['id']}")
    assert recalculated_second.status_code == 200
    assert recalculated_second.json()["materials"] == []
    semi_requirement = next(
        item
        for item in recalculated_second.json()["manufactured_items"]
        if not item["is_plan_output"]
    )
    assert Decimal(semi_requirement["stock_used_quantity"]) == Decimal("2")
    assert Decimal(semi_requirement["to_produce_quantity"]) == Decimal("0")


@pytest.mark.asyncio
async def test_requirement_quantity_and_money_use_domain_rounding(
    client: AsyncClient,
) -> None:
    material = await create_material(
        client, name="Compound", stock="0", price="1"
    )
    product = await create_item(client, name="Panel", is_product=True)
    await activate_process(
        client,
        name="Make panel",
        output=product,
        input_type="material",
        input_id=material["id"],
        input_quantity="1.234567",
    )
    response = await client.post(
        "/api/v1/production-plans",
        json={"product_id": product["id"], "planned_quantity": "3"},
    )
    assert response.status_code == 201, response.text
    plan = response.json()
    assert Decimal(plan["materials"][0]["required_quantity"]) == Decimal(
        "3.703701"
    )
    assert Decimal(plan["estimated_cost"]) == Decimal("3.70")
