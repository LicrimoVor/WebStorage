import uuid
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from tests.integration.helpers import owner_product


async def create_item(client: AsyncClient, *, name: str, is_product: bool = True) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/manufactured-items",
        json={
            "name": name,
            "is_product": is_product,
            "product_id": None if is_product else await owner_product(client),
            "unit": "шт",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_material(client: AsyncClient, *, name: str) -> dict[str, Any]:
    response = await client.post("/api/v1/materials", json={"name": name, "unit": "кг"})
    assert response.status_code == 201, response.text
    return response.json()


async def create_operation(client: AsyncClient, *, name: str) -> dict[str, Any]:
    response = await client.post("/api/v1/operations", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


async def create_process(client: AsyncClient, *, name: str, output_item_id: str) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/technological-processes",
        json={"name": name, "output_item_id": output_item_id},
    )
    assert response.status_code == 201, response.text
    return response.json()


def graph(
    *,
    name: str,
    output_item_id: str,
    output_name: str,
    material_id: str | None = None,
    operation_id: str | None = None,
    manufactured_item_id: str | None = None,
    extra_edges: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    nodes: list[dict[str, object]] = []
    edges: list[dict[str, object]] = []
    preceding_id: str | None = None
    if material_id is not None:
        nodes.append(
            {
                "id": "material",
                "type": "material",
                "referenceId": material_id,
                "label": "Материал",
                "position": {"x": 0, "y": 0},
            }
        )
        preceding_id = "material"
    if manufactured_item_id is not None:
        nodes.append(
            {
                "id": "semi-finished",
                "type": "manufactured_item",
                "referenceId": manufactured_item_id,
                "label": "Полуфабрикат",
                "position": {"x": 0, "y": 0},
            }
        )
        preceding_id = "semi-finished"
    if operation_id is not None:
        nodes.append(
            {
                "id": "operation",
                "type": "operation",
                "referenceId": operation_id,
                "label": "Операция",
                "position": {"x": 100, "y": 0},
            }
        )
        if preceding_id is not None:
            edges.append(
                {
                    "id": f"{preceding_id}-output",
                    "source": preceding_id,
                    "target": "output",
                    "quantity": "2.500000",
                }
            )
        preceding_id = "operation"
    nodes.append(
        {
            "id": "output",
            "type": "output",
            "referenceId": output_item_id,
            "label": output_name,
            "position": {"x": 200, "y": 0},
        }
    )
    if preceding_id is not None:
        edges.append(
            {
                "id": f"{preceding_id}-output",
                "source": preceding_id,
                "target": "output",
                "quantity": "1.000000",
            }
        )
    edges.extend(extra_edges or [])
    return {
        "schemaVersion": 1,
        "name": name,
        "outputItemId": output_item_id,
        "nodes": nodes,
        "edges": edges,
    }


@pytest.mark.asyncio
async def test_create_list_and_partial_json_round_trip(client: AsyncClient) -> None:
    output = await create_item(client, name="Редуктор")
    created = await create_process(client, name="Сборка редуктора", output_item_id=output["id"])
    process = created["process"]
    version = created["version"]
    assert process["active_version"] is None
    assert process["latest_version"]["status"] == "draft"
    assert version["revision"] == 0
    assert version["graph"]["nodes"][0]["type"] == "output"

    listed = await client.get("/api/v1/technological-processes", params={"search": "РЕДУКТОР"})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    partial_document = {
        "schemaVersion": 1,
        "name": "Импортированный черновик",
        "outputItemId": None,
        "nodes": [
            {
                "id": "unmapped",
                "type": "material",
                "referenceId": None,
                "label": "Не сопоставлено",
                "position": {"x": 12.5, "y": -3},
            }
        ],
        "edges": [
            {
                "id": "broken",
                "source": "unmapped",
                "target": "missing",
                "quantity": None,
            }
        ],
    }
    imported = await client.post("/api/v1/technological-processes/import", json=partial_document)
    assert imported.status_code == 201, imported.text
    imported_body = imported.json()
    export = await client.get(
        "/api/v1/technological-processes/"
        f"{imported_body['process']['id']}/versions/"
        f"{imported_body['version']['id']}/export"
    )
    assert export.status_code == 200
    assert export.json() == {**partial_document, "defaultGroupId": None}


@pytest.mark.asyncio
async def test_activation_versions_and_active_immutability(client: AsyncClient) -> None:
    output = await create_item(client, name="Вал в сборе")
    material = await create_material(client, name="Пруток")
    operation = await create_operation(client, name="Точение")
    created = await create_process(client, name="Изготовление вала", output_item_id=output["id"])
    process_id = created["process"]["id"]
    version_id = created["version"]["id"]
    document = graph(
        name="Изготовление вала",
        output_item_id=output["id"],
        output_name="Вал в сборе",
        material_id=material["id"],
        operation_id=operation["id"],
    )
    saved = await client.put(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/graph",
        json=document,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 1
    assert Decimal(saved.json()["graph"]["edges"][0]["quantity"]) > 0

    activated = await client.post(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/activate"
    )
    assert activated.status_code == 200, activated.text
    assert activated.json()["status"] == "active"
    item = await client.get(f"/api/v1/manufactured-items/{output['id']}")
    assert item.json()["active_process_id"] == version_id

    immutable = await client.put(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/graph",
        json=document,
    )
    assert immutable.status_code == 409

    next_version = await client.post(
        f"/api/v1/technological-processes/{process_id}/versions", json={}
    )
    assert next_version.status_code == 201, next_version.text
    assert next_version.json()["version_number"] == 2
    assert next_version.json()["revision"] == 0
    assert next_version.json()["status"] == "draft"
    assert next_version.json()["graph"] == activated.json()["graph"]

    second_id = next_version.json()["id"]
    second_activation = await client.post(
        f"/api/v1/technological-processes/{process_id}/versions/{second_id}/activate"
    )
    assert second_activation.status_code == 200, second_activation.text
    versions = await client.get(f"/api/v1/technological-processes/{process_id}/versions")
    statuses = {item["version_number"]: item["status"] for item in versions.json()["items"]}
    assert statuses == {2: "active", 1: "archived"}


@pytest.mark.asyncio
async def test_activation_rejects_missing_archived_and_broken_references(
    client: AsyncClient,
) -> None:
    output = await create_item(client, name="Крышка")
    created = await create_process(client, name="Обработка крышки", output_item_id=output["id"])
    process_id = created["process"]["id"]
    version_id = created["version"]["id"]
    invalid_document = graph(
        name="Обработка крышки",
        output_item_id=output["id"],
        output_name="Крышка",
        material_id=str(uuid.uuid4()),
        extra_edges=[
            {
                "id": "broken",
                "source": "missing",
                "target": "output",
                "quantity": "1",
            }
        ],
    )
    saved = await client.put(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/graph",
        json=invalid_document,
    )
    assert saved.status_code == 200, saved.text
    activation = await client.post(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/activate"
    )
    assert activation.status_code == 422
    assert "missing entity" in activation.json()["detail"]
    assert "broken" in activation.json()["detail"]


@pytest.mark.asyncio
async def test_activation_rejects_local_and_interprocess_cycles(
    client: AsyncClient,
) -> None:
    output = await create_item(client, name="Циклическая деталь")
    operation = await create_operation(client, name="Циклическая операция")
    created = await create_process(client, name="Локальный цикл", output_item_id=output["id"])
    process_id = created["process"]["id"]
    version_id = created["version"]["id"]
    cyclic = graph(
        name="Локальный цикл",
        output_item_id=output["id"],
        output_name="Циклическая деталь",
        operation_id=operation["id"],
        extra_edges=[
            {
                "id": "back",
                "source": "output",
                "target": "operation",
                "quantity": "1",
            }
        ],
    )
    assert (
        await client.put(
            f"/api/v1/technological-processes/{process_id}/versions/{version_id}/graph",
            json=cyclic,
        )
    ).status_code == 200
    local_activation = await client.post(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/activate"
    )
    assert local_activation.status_code == 422
    assert "graph contains a cycle" in local_activation.json()["detail"]

    item_a = await create_item(client, name="Узел A", is_product=False)
    item_b = await create_item(client, name="Узел B", is_product=False)
    process_a = await create_process(client, name="Процесс A", output_item_id=item_a["id"])
    graph_a = graph(
        name="Процесс A",
        output_item_id=item_a["id"],
        output_name="Узел A",
        manufactured_item_id=item_b["id"],
    )
    a_id = process_a["process"]["id"]
    a_version = process_a["version"]["id"]
    assert (
        await client.put(
            f"/api/v1/technological-processes/{a_id}/versions/{a_version}/graph",
            json=graph_a,
        )
    ).status_code == 200
    assert (
        await client.post(f"/api/v1/technological-processes/{a_id}/versions/{a_version}/activate")
    ).status_code == 200

    rejected = await client.post(
        "/api/v1/technological-processes",
        json={"name": "Процесс B", "output_item_id": item_b["id"]},
    )
    assert rejected.status_code == 201, rejected.text
    b = rejected.json()
    b_graph = graph(
        name="Процесс B",
        output_item_id=item_b["id"],
        output_name="Узел B",
        manufactured_item_id=item_a["id"],
    )
    saved = await client.put(
        f"/api/v1/technological-processes/{b['process']['id']}/versions/{b['version']['id']}/graph",
        json=b_graph,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["status"] == "error"
    assert (
        "manufactured item processes contain a dependency cycle"
        in saved.json()["validation_errors"]
    )
    activation = await client.post(
        f"/api/v1/technological-processes/{b['process']['id']}/versions/{b['version']['id']}/activate"
    )
    assert activation.status_code == 422


@pytest.mark.asyncio
async def test_draft_autosave_uses_optimistic_revision(client: AsyncClient) -> None:
    output = await create_item(client, name="Автосохраняемая деталь")
    created = await create_process(client, name="Автосохранение", output_item_id=output["id"])
    process_id = created["process"]["id"]
    version_id = created["version"]["id"]
    document = created["version"]["graph"]
    first = await client.put(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/draft",
        json={"expected_revision": 0, "graph": document},
    )
    assert first.status_code == 200, first.text
    assert first.json()["revision"] == 1

    stale = await client.put(
        f"/api/v1/technological-processes/{process_id}/versions/{version_id}/draft",
        json={"expected_revision": 0, "graph": document},
    )
    assert stale.status_code == 409
    assert "another session" in stale.json()["detail"]


@pytest.mark.asyncio
async def test_process_default_group_survives_reload_and_rejects_unknown_group(
    client: AsyncClient,
) -> None:
    output = await create_item(client, name="Default group output")
    group = (await client.post("/api/v1/inventory-groups", json={"name": "Default group"})).json()
    response = await client.post(
        "/api/v1/technological-processes",
        json={
            "name": "Grouped process",
            "output_item_id": output["id"],
            "default_group_id": group["id"],
        },
    )
    assert response.status_code == 201, response.text
    process = response.json()["process"]
    assert process["default_group_id"] == group["id"]
    loaded = (await client.get(f"/api/v1/technological-processes/{process['id']}")).json()
    assert loaded["default_group_id"] == group["id"]
    assert (await client.delete(f"/api/v1/inventory-groups/{group['id']}")).status_code == 204
    loaded = (await client.get(f"/api/v1/technological-processes/{process['id']}")).json()
    assert loaded["default_group_id"] is None
    trash_entry = (await client.get("/api/v1/trash")).json()["items"][0]
    assert (await client.post(f"/api/v1/trash/{trash_entry['id']}/restore")).status_code == 204
    loaded = (await client.get(f"/api/v1/technological-processes/{process['id']}")).json()
    assert loaded["default_group_id"] == group["id"]
    other = await create_item(client, name="Invalid group output")
    response = await client.post(
        "/api/v1/technological-processes",
        json={
            "name": "Invalid group process",
            "output_item_id": other["id"],
            "default_group_id": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_json_export_import_preserves_default_group(client: AsyncClient) -> None:
    output = await create_item(client, name="JSON group output")
    group = (await client.post("/api/v1/inventory-groups", json={"name": "JSON group"})).json()
    response = await client.post(
        "/api/v1/technological-processes",
        json={
            "name": "JSON group process",
            "output_item_id": output["id"],
            "default_group_id": group["id"],
        },
    )
    assert response.status_code == 201, response.text
    created = response.json()
    process_id, version_id = created["process"]["id"], created["version"]["id"]
    exported = (
        await client.get(
            f"/api/v1/technological-processes/{process_id}/versions/{version_id}/export"
        )
    ).json()
    assert exported["defaultGroupId"] == group["id"]
    assert (await client.delete(f"/api/v1/technological-processes/{process_id}")).status_code == 204
    response = await client.post("/api/v1/technological-processes/import", json=exported)
    assert response.status_code == 201, response.text
    assert response.json()["process"]["default_group_id"] == group["id"]
    assert response.json()["version"]["graph"]["defaultGroupId"] == group["id"]
    exported["name"] = "Missing JSON group"
    exported["outputItemId"] = None
    exported["defaultGroupId"] = str(uuid.uuid4())
    response = await client.post("/api/v1/technological-processes/import", json=exported)
    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_error_draft_is_persisted_and_can_be_fixed(client: AsyncClient) -> None:
    output = await create_item(client, name="Fixable output")
    created = await create_process(client, name="Fixable process", output_item_id=output["id"])
    pid, vid = created["process"]["id"], created["version"]["id"]
    document = created["version"]["graph"]
    document["nodes"].append({"id": "unmapped", "type": "material", "referenceId": None})
    document["edges"].append(
        {"id": "unmapped-output", "source": "unmapped", "target": "output", "quantity": "1"}
    )
    response = await client.put(
        f"/api/v1/technological-processes/{pid}/versions/{vid}/draft",
        json={"expected_revision": 0, "graph": document},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "error"
    assert response.json()["validation_errors"]
    reloaded = (await client.get(f"/api/v1/technological-processes/{pid}/versions/{vid}")).json()
    assert reloaded["graph"]["nodes"] == response.json()["graph"]["nodes"]
    assert reloaded["status"] == "error"
    assert (
        await client.post(f"/api/v1/technological-processes/{pid}/versions/{vid}/activate")
    ).status_code == 422
    repeated = await client.put(
        f"/api/v1/technological-processes/{pid}/versions/{vid}/draft",
        json={"expected_revision": 1, "graph": document},
    )
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["status"] == "error"
    assert repeated.json()["revision"] == 2
    document["nodes"] = document["nodes"][:1]
    document["edges"] = []
    fixed = await client.put(
        f"/api/v1/technological-processes/{pid}/versions/{vid}/draft",
        json={"expected_revision": 2, "graph": document},
    )
    assert fixed.status_code == 200, fixed.text
    assert fixed.json()["status"] == "draft"
    assert fixed.json()["validation_errors"] == []


@pytest.mark.asyncio
async def test_existing_semi_recipe_is_allowed_as_leaf_but_not_as_target(
    client: AsyncClient,
) -> None:
    owner = (await create_item(client, name="Consumer of another product component"))["id"]
    semi = await create_item(client, name="Reusable component", is_product=False)
    recipe = await create_process(client, name="Component recipe", output_item_id=semi["id"])
    created = await create_process(client, name="Consuming process", output_item_id=owner)
    pid, vid = created["process"]["id"], created["version"]["id"]
    document = graph(
        name="Consuming process",
        output_item_id=owner,
        output_name="Owner",
        manufactured_item_id=semi["id"],
    )
    saved = await client.put(
        f"/api/v1/technological-processes/{pid}/versions/{vid}/graph", json=document
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["status"] == "draft"
    owners = (
        await client.get(
            "/api/v1/technological-processes/recipe-owners", params={"exclude_process_id": pid}
        )
    ).json()
    assert owners[semi["id"]] == recipe["process"]["name"]
    material = await create_material(client, name="Forbidden second recipe")
    document["nodes"].append({"id": "material", "type": "material", "referenceId": material["id"]})
    document["edges"].append(
        {"id": "incoming", "source": "material", "target": "semi-finished", "quantity": "1"}
    )
    saved = await client.put(
        f"/api/v1/technological-processes/{pid}/versions/{vid}/graph", json=document
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["status"] == "error"
    assert saved.json()["validation_errors"]
    original_pid, original_vid = recipe["process"]["id"], recipe["version"]["id"]
    original = await client.put(
        f"/api/v1/technological-processes/{original_pid}/versions/{original_vid}/graph",
        json=recipe["version"]["graph"],
    )
    assert original.status_code == 200, original.text
    assert original.json()["status"] == "draft"


@pytest.mark.asyncio
async def test_settings_deactivate_and_version_trash_preserve_history(client: AsyncClient) -> None:
    output = await create_item(client, name="Version history output")
    created = await create_process(client, name="Version history", output_item_id=output["id"])
    pid, vid = created["process"]["id"], created["version"]["id"]
    root = f"/api/v1/technological-processes/{pid}"
    group = (await client.post("/api/v1/inventory-groups", json={"name": "Updated group"})).json()
    updated = await client.patch(
        root, json={"name": "Renamed process", "default_group_id": group["id"]}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["default_group_id"] == group["id"]
    assert (await client.post(f"{root}/versions/{vid}/activate")).status_code == 200
    newer = (await client.post(f"{root}/versions", json={})).json()
    assert (await client.delete(f"/api/v1/trash/process_version/{vid}")).status_code == 409
    deactivated = await client.post(f"{root}/deactivate")
    assert deactivated.status_code == 200, deactivated.text
    assert deactivated.json()["active_version"] is None
    item = (await client.get(f"/api/v1/manufactured-items/{output['id']}")).json()
    assert item["active_process_id"] is None
    assert (await client.get(f"{root}/versions/{vid}")).json()["status"] == "archived"
    assert (await client.delete(f"/api/v1/trash/process_version/{newer['id']}")).status_code == 204
    assert (await client.get(f"{root}/versions/{newer['id']}")).status_code == 404
    assert len((await client.get(f"{root}/versions")).json()["items"]) == 1
    assert (await client.delete(f"/api/v1/trash/process_version/{vid}")).status_code == 409
    next_version = (await client.post(f"{root}/versions", json={})).json()
    assert next_version["version_number"] == 3
    trash = (await client.get("/api/v1/trash")).json()
    entry = next(item for item in trash["items"] if item["entity_type"] == "process_version")
    assert (await client.post(f"/api/v1/trash/{entry['id']}/restore")).status_code == 204
    versions = (await client.get(f"{root}/versions")).json()["items"]
    assert [item["version_number"] for item in versions] == [3, 2, 1]


@pytest.mark.asyncio
async def test_disconnected_subgraph_is_saved_but_not_used_in_recipe(client: AsyncClient) -> None:
    output = await create_item(client, name="Island output")
    material = await create_material(client, name="Connected material")
    created = await create_process(client, name="Island process", output_item_id=output["id"])
    pid, vid = created["process"]["id"], created["version"]["id"]
    document = graph(
        name="Island process",
        output_item_id=output["id"],
        output_name=output["name"],
        material_id=material["id"],
    )
    document["nodes"].extend(
        [
            {"id": "island-a", "type": "material", "referenceId": None},
            {"id": "island-b", "type": "operation", "referenceId": None},
        ]
    )
    document["edges"].extend(
        [
            {"id": "island-1", "source": "island-a", "target": "island-b", "quantity": None},
            {"id": "island-2", "source": "island-b", "target": "island-a", "quantity": None},
        ]
    )
    saved = await client.put(
        f"/api/v1/technological-processes/{pid}/versions/{vid}/draft",
        json={"expected_revision": 0, "graph": document},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["status"] == "draft"
    assert saved.json()["validation_errors"] == []
    assert len(saved.json()["graph"]["nodes"]) == 4
    assert len(saved.json()["graph"]["edges"]) == 3
    activated = await client.post(f"/api/v1/technological-processes/{pid}/versions/{vid}/activate")
    assert activated.status_code == 200, activated.text
    exported = (
        await client.get(f"/api/v1/technological-processes/{pid}/versions/{vid}/export")
    ).json()
    assert len(exported["nodes"]) == 4


@pytest.mark.asyncio
async def test_recipe_lookup_returns_embedded_recipe_and_prefers_active_version(
    client: AsyncClient,
) -> None:
    output = await create_item(client, name="Recipe lookup output")
    semi_response = await client.post(
        "/api/v1/manufactured-items",
        json={
            "name": "Recipe lookup semi",
            "is_product": False,
            "product_id": output["id"],
            "unit": "шт",
        },
    )
    assert semi_response.status_code == 201, semi_response.text
    semi = semi_response.json()
    material = await create_material(client, name="Recipe lookup material")
    created = await create_process(client, name="Recipe lookup", output_item_id=output["id"])
    pid, vid = created["process"]["id"], created["version"]["id"]
    document = graph(
        name="Recipe lookup",
        output_item_id=output["id"],
        output_name=output["name"],
        manufactured_item_id=semi["id"],
    )
    document["nodes"].append(
        {"id": "material", "type": "material", "referenceId": material["id"], "label": "Сталь"}
    )
    document["edges"].append(
        {"id": "material-semi", "source": "material", "target": "semi-finished", "quantity": "2.5"}
    )
    saved = await client.put(
        f"/api/v1/technological-processes/{pid}/versions/{vid}/draft",
        json={"expected_revision": 0, "graph": document},
    )
    assert saved.status_code == 200, saved.text
    recipe = await client.get(f"/api/v1/technological-processes/recipes/{semi['id']}")
    assert recipe.status_code == 200, recipe.text
    assert recipe.json()["process_id"] == pid
    assert recipe.json()["target_node_id"] == "semi-finished"
    assert recipe.json()["version"]["graph"]["nodes"] == saved.json()["graph"]["nodes"]
    assert Decimal(recipe.json()["version"]["graph"]["edges"][0]["quantity"]) == Decimal("2.5")
    assert (
        await client.get(
            f"/api/v1/technological-processes/recipes/{semi['id']}?exclude_process_id={pid}"
        )
    ).json() is None
    assert (
        await client.post(f"/api/v1/technological-processes/{pid}/versions/{vid}/activate")
    ).status_code == 200
    next_version = await client.post(f"/api/v1/technological-processes/{pid}/versions", json={})
    assert next_version.status_code == 201
    recipe = (await client.get(f"/api/v1/technological-processes/recipes/{output['id']}")).json()
    assert recipe["version"]["id"] == vid
    assert recipe["target_node_id"] == "output"
    assert (await client.post(f"/api/v1/technological-processes/{pid}/archive")).status_code == 200
    assert (
        await client.get(f"/api/v1/technological-processes/recipes/{semi['id']}")
    ).json() is None


@pytest.mark.asyncio
@pytest.mark.parametrize("target_type", ["material", "operation"])
async def test_incoming_leaf_connections_are_saved_as_error(
    client: AsyncClient, target_type: str
) -> None:
    output = await create_item(client, name=f"Leaf output {target_type}")
    material = await create_material(client, name=f"Leaf material {target_type}")
    operation = await create_operation(client, name=f"Leaf operation {target_type}")
    created = await create_process(
        client, name=f"Leaf process {target_type}", output_item_id=output["id"]
    )
    pid, vid = created["process"]["id"], created["version"]["id"]
    document = graph(
        name=f"Leaf process {target_type}",
        output_item_id=output["id"],
        output_name=output["name"],
        material_id=material["id"],
        operation_id=operation["id"],
    )
    document["edges"].append(
        {
            "id": "illegal",
            "source": "operation" if target_type == "material" else "material",
            "target": target_type,
            "quantity": "1",
        }
    )
    saved = await client.put(
        f"/api/v1/technological-processes/{pid}/versions/{vid}/draft",
        json={"expected_revision": 0, "graph": document},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["status"] == "error"
    assert "Материалы и операции не могут иметь входящие связи" in saved.json()["validation_errors"]
    assert (
        await client.post(f"/api/v1/technological-processes/{pid}/versions/{vid}/activate")
    ).status_code == 422
