import asyncio
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient


async def create_material(
    client: AsyncClient, *, name: str, stock: str
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/materials",
        json={"name": name, "unit": "kg", "initial_quantity": stock, "price": "1"},
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
            "unit": "pcs",
            "initial_quantity": stock,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def activate_process(
    client: AsyncClient,
    *,
    name: str,
    output: dict[str, Any],
    inputs: list[tuple[str, str, str]],
) -> dict[str, Any]:
    created = await client.post(
        "/api/v1/technological-processes",
        json={"name": name, "output_item_id": output["id"]},
    )
    assert created.status_code == 201, created.text
    process_id = created.json()["process"]["id"]
    version_id = created.json()["version"]["id"]
    nodes: list[dict[str, object]] = []
    edges: list[dict[str, object]] = []
    for index, (node_type, reference_id, quantity) in enumerate(inputs):
        node_id = f"input-{index}"
        nodes.append(
            {
                "id": node_id,
                "type": node_type,
                "referenceId": reference_id,
                "label": node_id,
                "position": {"x": -200, "y": index * 100},
            }
        )
        edges.append(
            {
                "id": f"{node_id}-output",
                "source": node_id,
                "target": "output",
                "quantity": quantity,
            }
        )
    nodes.append(
        {
            "id": "output",
            "type": "output",
            "referenceId": output["id"],
            "label": output["name"],
            "position": {"x": 200, "y": 0},
        }
    )
    saved = await client.put(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/graph",
        json={
            "schemaVersion": 1,
            "name": name,
            "outputItemId": output["id"],
            "nodes": nodes,
            "edges": edges,
        },
    )
    assert saved.status_code == 200, saved.text
    activated = await client.post(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/activate"
    )
    assert activated.status_code == 200, activated.text
    return activated.json()


async def create_product_plan(
    client: AsyncClient, *, product_id: str, quantity: str = "5"
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/production-plans",
        json={"product_id": product_id, "planned_quantity": quantity},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def activate_embedded_semi_recipe(
    client: AsyncClient,
    *,
    name: str,
    output: dict[str, Any],
    semi: dict[str, Any],
    material: dict[str, Any],
) -> None:
    created = await client.post(
        "/api/v1/technological-processes",
        json={"name": name, "output_item_id": output["id"]},
    )
    process_id = created.json()["process"]["id"]
    version_id = created.json()["version"]["id"]
    graph = {
        "schemaVersion": 1,
        "name": name,
        "outputItemId": output["id"],
        "nodes": [
            {
                "id": "material",
                "type": "material",
                "referenceId": material["id"],
                "label": material["name"],
                "position": {"x": -300, "y": 0},
            },
            {
                "id": "semi",
                "type": "manufactured_item",
                "referenceId": semi["id"],
                "label": semi["name"],
                "position": {"x": 0, "y": 0},
            },
            {
                "id": "output",
                "type": "output",
                "referenceId": output["id"],
                "label": output["name"],
                "position": {"x": 300, "y": 0},
            },
        ],
        "edges": [
            {
                "id": "material-semi",
                "source": "material",
                "target": "semi",
                "quantity": "1",
            },
            {
                "id": "semi-output",
                "source": "semi",
                "target": "output",
                "quantity": "1",
            },
        ],
    }
    saved = await client.put(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/graph",
        json=graph,
    )
    assert saved.status_code == 200, saved.text
    activated = await client.post(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/activate"
    )
    assert activated.status_code == 200, activated.text


@pytest.mark.asyncio
async def test_atomic_product_registration_posts_components_and_progress(
    client: AsyncClient,
) -> None:
    material = await create_material(client, name="Plate", stock="20")
    semi = await create_item(client, name="Bracket", is_product=False, stock="10")
    product = await create_item(client, name="Assembly", is_product=True)
    version = await activate_process(
        client,
        name="Assemble product",
        output=product,
        inputs=[
            ("material", material["id"], "3"),
            ("manufactured_item", semi["id"], "2"),
        ],
    )
    plan = await create_product_plan(client, product_id=product["id"])

    response = await client.post(
        f"/api/v1/production-plans/{plan['id']}/production-records",
        headers={"Idempotency-Key": "production-success-1"},
        json={"item_id": product["id"], "quantity": "2", "comment": "Shift 1"},
    )
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["process_version_id"] == version["id"]
    assert Decimal(record["quantity"]) == Decimal("2")
    assert Decimal(record["output_balance_after"]) == Decimal("2")
    consumed = {
        (component["kind"], component["entity_id"]): Decimal(component["quantity"])
        for component in record["components"]
    }
    assert consumed == {
        ("material", material["id"]): Decimal("6"),
        ("manufactured_item", semi["id"]): Decimal("4"),
    }

    material_read = await client.get(f"/api/v1/materials/{material['id']}")
    semi_read = await client.get(f"/api/v1/manufactured-items/{semi['id']}")
    product_read = await client.get(f"/api/v1/manufactured-items/{product['id']}")
    assert Decimal(material_read.json()["free_quantity"]) == Decimal("14")
    assert Decimal(semi_read.json()["free_quantity"]) == Decimal("6")
    assert Decimal(product_read.json()["free_quantity"]) == Decimal("2")

    plan_read = await client.get(f"/api/v1/production-plans/{plan['id']}")
    assert Decimal(plan_read.json()["produced_quantity"]) == Decimal("2")
    assert Decimal(plan_read.json()["remaining_quantity"]) == Decimal("3")
    history = await client.get(
        f"/api/v1/production-plans/{plan['id']}/production-records"
    )
    assert history.status_code == 200
    assert history.json()["total"] == 1
    assert history.json()["items"][0]["id"] == record["id"]

    completed = await client.post(
        f"/api/v1/production-plans/{plan['id']}/production-records",
        headers={"Idempotency-Key": "production-success-2"},
        json={"item_id": product["id"], "quantity": "3"},
    )
    assert completed.status_code == 201, completed.text
    completed_plan = await client.get(f"/api/v1/production-plans/{plan['id']}")
    assert completed_plan.json()["status"] == "completed"
    assert Decimal(completed_plan.json()["remaining_quantity"]) == Decimal("0")
    assert completed_plan.json()["materials"] == []
    summary = await client.get("/api/v1/production-plans/summary")
    assert summary.json()["active_plans"] == 0


@pytest.mark.asyncio
async def test_insufficient_component_rolls_back_every_posting(
    client: AsyncClient,
) -> None:
    material = await create_material(client, name="Tube", stock="20")
    semi = await create_item(client, name="Insert", is_product=False, stock="10")
    product = await create_item(client, name="Unit", is_product=True)
    await activate_process(
        client,
        name="Make unit",
        output=product,
        inputs=[
            ("material", material["id"], "3"),
            ("manufactured_item", semi["id"], "2"),
        ],
    )
    plan = await create_product_plan(client, product_id=product["id"])
    consumed = await client.post(
        f"/api/v1/manufactured-items/{semi['id']}/movements",
        json={"movement_type": "consumption", "quantity": "9"},
    )
    assert consumed.status_code == 201, consumed.text

    failed = await client.post(
        f"/api/v1/production-plans/{plan['id']}/production-records",
        headers={"Idempotency-Key": "production-rollback-1"},
        json={"item_id": product["id"], "quantity": "2"},
    )
    assert failed.status_code == 409, failed.text
    assert "negative" in failed.json()["detail"]
    material_read = await client.get(f"/api/v1/materials/{material['id']}")
    product_read = await client.get(f"/api/v1/manufactured-items/{product['id']}")
    plan_read = await client.get(f"/api/v1/production-plans/{plan['id']}")
    assert Decimal(material_read.json()["free_quantity"]) == Decimal("20")
    assert Decimal(product_read.json()["free_quantity"]) == Decimal("0")
    assert Decimal(plan_read.json()["produced_quantity"]) == Decimal("0")
    history = await client.get(
        f"/api/v1/production-plans/{plan['id']}/production-records"
    )
    assert history.json()["total"] == 0


@pytest.mark.asyncio
async def test_idempotency_replay_returns_one_record_and_one_output(
    client: AsyncClient,
) -> None:
    material = await create_material(client, name="Resin", stock="20")
    product = await create_item(client, name="Cover", is_product=True)
    await activate_process(
        client,
        name="Mould cover",
        output=product,
        inputs=[("material", material["id"], "2")],
    )
    plan = await create_product_plan(client, product_id=product["id"])
    path = f"/api/v1/production-plans/{plan['id']}/production-records"
    payload = {"item_id": product["id"], "quantity": "1"}
    headers = {"Idempotency-Key": "production-replay-1"}
    first = await client.post(path, headers=headers, json=payload)
    replay = await client.post(path, headers=headers, json=payload)
    assert first.status_code == 201, first.text
    assert replay.status_code == 201, replay.text
    assert replay.json()["id"] == first.json()["id"]
    conflict = await client.post(
        path,
        headers=headers,
        json={"item_id": product["id"], "quantity": "2"},
    )
    assert conflict.status_code == 409
    product_read = await client.get(f"/api/v1/manufactured-items/{product['id']}")
    assert Decimal(product_read.json()["free_quantity"]) == Decimal("1")
    history = await client.get(path)
    assert history.json()["total"] == 1


@pytest.mark.asyncio
async def test_intermediate_production_reduces_recursive_requirement(
    client: AsyncClient,
) -> None:
    material = await create_material(client, name="Bar", stock="20")
    semi = await create_item(client, name="Shaft", is_product=False)
    product = await create_item(client, name="Gearbox", is_product=True)
    semi_version = await activate_process(
        client,
        name="Make shaft",
        output=semi,
        inputs=[("material", material["id"], "3")],
    )
    await activate_process(
        client,
        name="Make gearbox",
        output=product,
        inputs=[("manufactured_item", semi["id"], "2")],
    )
    plan = await create_product_plan(client, product_id=product["id"], quantity="2")
    response = await client.post(
        f"/api/v1/production-plans/{plan['id']}/production-records",
        headers={"Idempotency-Key": "production-intermediate-1"},
        json={"item_id": semi["id"], "quantity": "2"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["process_version_id"] == semi_version["id"]
    plan_read = await client.get(f"/api/v1/production-plans/{plan['id']}")
    assert Decimal(plan_read.json()["produced_quantity"]) == Decimal("0")
    assert Decimal(plan_read.json()["materials"][0]["required_quantity"]) == Decimal(
        "6"
    )
    semi_requirement = next(
        item
        for item in plan_read.json()["manufactured_items"]
        if item["manufactured_item_id"] == semi["id"]
    )
    assert Decimal(semi_requirement["stock_used_quantity"]) == Decimal("2")
    assert Decimal(semi_requirement["to_produce_quantity"]) == Decimal("2")


@pytest.mark.asyncio
async def test_concurrent_production_cannot_exceed_plan_remaining(
    client: AsyncClient,
) -> None:
    material = await create_material(client, name="Wire", stock="100")
    product = await create_item(client, name="Harness", is_product=True)
    await activate_process(
        client,
        name="Make harness",
        output=product,
        inputs=[("material", material["id"], "1")],
    )
    plan = await create_product_plan(client, product_id=product["id"])
    path = f"/api/v1/production-plans/{plan['id']}/production-records"
    responses = await asyncio.gather(
        client.post(
            path,
            headers={"Idempotency-Key": "production-concurrent-1"},
            json={"item_id": product["id"], "quantity": "3"},
        ),
        client.post(
            path,
            headers={"Idempotency-Key": "production-concurrent-2"},
            json={"item_id": product["id"], "quantity": "3"},
        ),
    )
    assert sorted(response.status_code for response in responses) == [201, 422]
    plan_read = await client.get(f"/api/v1/production-plans/{plan['id']}")
    assert Decimal(plan_read.json()["produced_quantity"]) == Decimal("3")
    product_read = await client.get(f"/api/v1/manufactured-items/{product['id']}")
    assert Decimal(product_read.json()["free_quantity"]) == Decimal("3")


@pytest.mark.asyncio
async def test_direct_production_recursively_builds_missing_stock_and_records_work(
    client: AsyncClient,
) -> None:
    material = await create_material(client, name="Direct bar", stock="20")
    semi = await create_item(
        client, name="Direct shaft", is_product=False, stock="1"
    )
    product = await create_item(client, name="Direct gearbox", is_product=True)
    cut = (
        await client.post(
            "/api/v1/operations",
            json={"name": "Direct cutting", "time_norm": "4", "price_per_operation": "5"},
        )
    ).json()
    assembly = (
        await client.post(
            "/api/v1/operations",
            json={"name": "Direct assembly", "time_norm": "10", "price_per_operation": "8"},
        )
    ).json()
    await activate_process(
        client,
        name="Direct shaft recipe",
        output=semi,
        inputs=[
            ("material", material["id"], "2"),
            ("operation", cut["id"], "1"),
        ],
    )
    await activate_process(
        client,
        name="Direct gearbox recipe",
        output=product,
        inputs=[
            ("manufactured_item", semi["id"], "2"),
            ("operation", assembly["id"], "1"),
        ],
    )
    employee = (
        await client.post(
            "/api/v1/employees",
            json={
                "full_name": "Direct hourly worker",
                "compensation_type": "hourly",
                "hourly_rate": "600",
            },
        )
    ).json()

    preview_response = await client.post(
        f"/api/v1/manufactured-items/{product['id']}/production-preview",
        json={"quantity": "2"},
    )
    assert preview_response.status_code == 200, preview_response.text
    preview = preview_response.json()
    assert preview["can_produce"] is True
    assert Decimal(preview["materials"][0]["required_quantity"]) == Decimal("6")
    child = preview["tree"]["children"][0]
    assert Decimal(child["stock_used_quantity"]) == Decimal("1")
    assert Decimal(child["to_produce_quantity"]) == Decimal("3")
    operations = {
        row["operation_id"]: Decimal(row["required_quantity"])
        for row in preview["operations"]
    }
    assert operations == {
        cut["id"]: Decimal("3"),
        assembly["id"]: Decimal("2"),
    }

    produced_response = await client.post(
        f"/api/v1/manufactured-items/{product['id']}/produce",
        headers={"Idempotency-Key": "direct-recursive-production-1"},
        json={
            "quantity": "2",
            "operation_assignments": [
                {"operation_id": assembly["id"], "employee_id": employee["id"]}
            ],
        },
    )
    assert produced_response.status_code == 201, produced_response.text
    record = produced_response.json()
    assert record["production_plan_id"] is None
    assert len(record["work_entry_ids"]) == 2
    assert Decimal(record["output_balance_after"]) == Decimal("2")
    replay = await client.post(
        f"/api/v1/manufactured-items/{product['id']}/produce",
        headers={"Idempotency-Key": "direct-recursive-production-1"},
        json={
            "quantity": "2",
            "operation_assignments": [
                {"operation_id": assembly["id"], "employee_id": employee["id"]}
            ],
        },
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == record["id"]
    changed_assignment = await client.post(
        f"/api/v1/manufactured-items/{product['id']}/produce",
        headers={"Idempotency-Key": "direct-recursive-production-1"},
        json={
            "quantity": "2",
            "operation_assignments": [
                {"operation_id": cut["id"], "employee_id": employee["id"]},
                {"operation_id": assembly["id"], "employee_id": employee["id"]},
            ],
        },
    )
    assert changed_assignment.status_code == 409
    assert Decimal(
        (await client.get(f"/api/v1/materials/{material['id']}")).json()[
            "free_quantity"
        ]
    ) == Decimal("14")
    assert Decimal(
        (await client.get(f"/api/v1/manufactured-items/{semi['id']}")).json()[
            "free_quantity"
        ]
    ) == Decimal("0")

    assembly_work = (
        await client.get(f"/api/v1/operations/{assembly['id']}/work-entries")
    ).json()["items"][0]
    assert assembly_work["employee_id"] == employee["id"]
    assert assembly_work["input_mode"] == "time"
    assert Decimal(assembly_work["accrued_amount"]) == Decimal("200")
    anonymous_work = (
        await client.get(f"/api/v1/operations/{cut['id']}/work-entries")
    ).json()["items"][0]
    assert anonymous_work["employee_id"] is None
    assert anonymous_work["employee_name"] == "Анонимно"
    assert anonymous_work["accrued_amount"] is None


@pytest.mark.asyncio
async def test_direct_semi_production_rejects_multiple_active_embedded_recipes(
    client: AsyncClient,
) -> None:
    material = await create_material(client, name="Ambiguous raw", stock="10")
    semi = await create_item(client, name="Ambiguous semi", is_product=False)
    first = await create_item(client, name="Ambiguous product A", is_product=True)
    second = await create_item(client, name="Ambiguous product B", is_product=True)
    await activate_embedded_semi_recipe(
        client,
        name="Ambiguous recipe A",
        output=first,
        semi=semi,
        material=material,
    )
    await activate_embedded_semi_recipe(
        client,
        name="Ambiguous recipe B",
        output=second,
        semi=semi,
        material=material,
    )

    response = await client.post(
        f"/api/v1/manufactured-items/{semi['id']}/production-preview",
        json={"quantity": "1"},
    )
    assert response.status_code == 422
    assert "Several active recipes" in response.json()["detail"]
