from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from tests.integration.helpers import embedded_process, owner_product


async def create_material(
    client: AsyncClient, *, name: str, stock: str, group_ids: list[str] | None = None
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/materials",
        json={
            "name": name,
            "unit": "kg",
            "initial_quantity": stock,
            "group_ids": group_ids or [],
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
    group_ids: list[str] | None = None,
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/manufactured-items",
        json={
            "name": name,
            "is_product": is_product,
            "product_id": None if is_product else await owner_product(client),
            "unit": "pcs",
            "initial_quantity": stock,
            "group_ids": group_ids or [],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def activate_process(
    client: AsyncClient,
    *,
    name: str,
    output: dict[str, Any],
    inputs: list[tuple[str, str]],
) -> None:
    created = await client.post(
        "/api/v1/technological-processes",
        json={"name": name, "output_item_id": output["id"]},
    )
    assert created.status_code == 201, created.text
    process_id = created.json()["process"]["id"]
    version_id = created.json()["version"]["id"]
    nodes = [
        {
            "id": f"input-{index}",
            "type": node_type,
            "referenceId": reference_id,
            "label": f"Input {index}",
            "position": {"x": -200, "y": index * 100},
        }
        for index, (node_type, reference_id) in enumerate(inputs)
    ]
    nodes.append(
        {
            "id": "output",
            "type": "output",
            "referenceId": output["id"],
            "label": output["name"],
            "position": {"x": 200, "y": 0},
        }
    )
    edges = [
        {
            "id": f"edge-{index}",
            "source": f"input-{index}",
            "target": "output",
            "quantity": "1",
        }
        for index in range(len(inputs))
    ]
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


@pytest.mark.asyncio
async def test_groups_product_filters_and_stock_revision(client: AsyncClient) -> None:
    group_response = await client.post(
        "/api/v1/inventory-groups", json={"name": "Metal components"}
    )
    assert group_response.status_code == 201, group_response.text
    group = group_response.json()

    material = await create_material(
        client, name="Revision steel", stock="10", group_ids=[group["id"]]
    )
    unrelated = await create_material(client, name="Unrelated paint", stock="3")
    product = await create_item(client, name="Revision table", is_product=True)
    semi = await create_item(
        client,
        name="Revision frame",
        is_product=False,
        stock="2",
        group_ids=[group["id"]],
    )
    await embedded_process(client, product, semi, [("material", material["id"], "1")], "1")

    materials = await client.get("/api/v1/materials", params={"product_id": product["id"]})
    assert materials.status_code == 200, materials.text
    assert [row["id"] for row in materials.json()["items"]] == [material["id"]]
    grouped_materials = await client.get("/api/v1/materials", params={"group_id": group["id"]})
    assert [row["id"] for row in grouped_materials.json()["items"]] == [material["id"]]

    semis = await client.get(
        "/api/v1/manufactured-items",
        params={"kind": "semi_finished", "product_id": product["id"]},
    )
    assert semis.status_code == 200, semis.text
    assert [row["id"] for row in semis.json()["items"]] == [semi["id"]]
    assert semis.json()["items"][0]["groups"] == [
        {"id": group["id"], "name": group["name"], "parent_id": None}
    ]

    revision_rows = await client.get("/api/v1/warehouse/revision")
    assert revision_rows.status_code == 200, revision_rows.text
    rows = {row["id"]: row for row in revision_rows.json()}
    assert {material["id"], unrelated["id"], semi["id"], product["id"]} <= rows.keys()
    assert rows[material["id"]]["products"] == [{"id": product["id"], "name": product["name"]}]
    assert rows[semi["id"]]["groups"][0]["id"] == group["id"]

    saved = await client.post(
        "/api/v1/warehouse/revisions",
        json={
            "comment": "Annual count",
            "entries": [
                {"id": material["id"], "type": "material", "counted_quantity": "7"},
                {"id": semi["id"], "type": "semi_finished", "counted_quantity": "4"},
                {"id": product["id"], "type": "product", "counted_quantity": "1"},
            ],
        },
    )
    assert saved.status_code == 201, saved.text
    assert {Decimal(row["adjustment"]) for row in saved.json()["entries"]} == {
        Decimal("-3"),
        Decimal("1"),
        Decimal("2"),
    }
    material_read = await client.get(f"/api/v1/materials/{material['id']}")
    semi_read = await client.get(f"/api/v1/manufactured-items/{semi['id']}")
    product_read = await client.get(f"/api/v1/manufactured-items/{product['id']}")
    assert Decimal(material_read.json()["free_quantity"]) == Decimal("7")
    assert Decimal(semi_read.json()["free_quantity"]) == Decimal("4")
    assert Decimal(product_read.json()["free_quantity"]) == Decimal("1")

    filtered_revision = await client.get(
        "/api/v1/warehouse/revision",
        params={"product_id": product["id"], "group_id": group["id"]},
    )
    assert {row["id"] for row in filtered_revision.json()} == {material["id"], semi["id"]}
