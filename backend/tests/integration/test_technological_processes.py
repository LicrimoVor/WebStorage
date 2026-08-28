import uuid
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient


async def create_item(
    client: AsyncClient, *, name: str, is_product: bool = True
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/manufactured-items",
        json={"name": name, "is_product": is_product, "unit": "шт"},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_material(client: AsyncClient, *, name: str) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/materials", json={"name": name, "unit": "кг"}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_operation(client: AsyncClient, *, name: str) -> dict[str, Any]:
    response = await client.post("/api/v1/operations", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


async def create_process(
    client: AsyncClient, *, name: str, output_item_id: str
) -> dict[str, Any]:
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
                    "id": f"{preceding_id}-operation",
                    "source": preceding_id,
                    "target": "operation",
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
    created = await create_process(
        client, name="Сборка редуктора", output_item_id=output["id"]
    )
    process = created["process"]
    version = created["version"]
    assert process["active_version"] is None
    assert process["latest_version"]["status"] == "draft"
    assert version["revision"] == 0
    assert version["graph"]["nodes"][0]["type"] == "output"

    listed = await client.get(
        "/api/v1/technological-processes", params={"search": "РЕДУКТОР"}
    )
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
    imported = await client.post(
        "/api/v1/technological-processes/import", json=partial_document
    )
    assert imported.status_code == 201, imported.text
    imported_body = imported.json()
    export = await client.get(
        "/api/v1/technological-processes/"
        f"{imported_body['process']['id']}/versions/"
        f"{imported_body['version']['id']}/export"
    )
    assert export.status_code == 200
    assert export.json() == partial_document


@pytest.mark.asyncio
async def test_activation_versions_and_active_immutability(client: AsyncClient) -> None:
    output = await create_item(client, name="Вал в сборе")
    material = await create_material(client, name="Пруток")
    operation = await create_operation(client, name="Точение")
    created = await create_process(
        client, name="Изготовление вала", output_item_id=output["id"]
    )
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
    versions = await client.get(
        f"/api/v1/technological-processes/{process_id}/versions"
    )
    statuses = {item["version_number"]: item["status"] for item in versions.json()["items"]}
    assert statuses == {2: "active", 1: "archived"}


@pytest.mark.asyncio
async def test_activation_rejects_missing_archived_and_broken_references(
    client: AsyncClient,
) -> None:
    output = await create_item(client, name="Крышка")
    created = await create_process(
        client, name="Обработка крышки", output_item_id=output["id"]
    )
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
    created = await create_process(
        client, name="Локальный цикл", output_item_id=output["id"]
    )
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
    process_a = await create_process(
        client, name="Процесс A", output_item_id=item_a["id"]
    )
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
        await client.post(
            f"/api/v1/technological-processes/{a_id}/versions/{a_version}/activate"
        )
    ).status_code == 200

    process_b = await create_process(
        client, name="Процесс B", output_item_id=item_b["id"]
    )
    graph_b = graph(
        name="Процесс B",
        output_item_id=item_b["id"],
        output_name="Узел B",
        manufactured_item_id=item_a["id"],
    )
    b_id = process_b["process"]["id"]
    b_version = process_b["version"]["id"]
    assert (
        await client.put(
            f"/api/v1/technological-processes/{b_id}/versions/{b_version}/graph",
            json=graph_b,
        )
    ).status_code == 200
    cross_activation = await client.post(
        f"/api/v1/technological-processes/{b_id}/versions/{b_version}/activate"
    )
    assert cross_activation.status_code == 422
    assert "dependency cycle" in cross_activation.json()["detail"]


@pytest.mark.asyncio
async def test_draft_autosave_uses_optimistic_revision(client: AsyncClient) -> None:
    output = await create_item(client, name="Автосохраняемая деталь")
    created = await create_process(
        client, name="Автосохранение", output_item_id=output["id"]
    )
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
