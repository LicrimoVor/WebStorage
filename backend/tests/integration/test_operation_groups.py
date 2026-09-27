import uuid

from httpx import AsyncClient


async def test_group_operations_filter_move_and_delete(client: AsyncClient) -> None:
    created = await client.post("/api/v1/operation-groups", json={"name": " Обработка "})
    assert created.status_code == 201, created.text
    group = created.json()
    assert group["name"] == "Обработка"
    duplicate = await client.post("/api/v1/operation-groups", json={"name": "обработка"})
    assert duplicate.status_code == 409
    assert (await client.post("/api/v1/operation-groups", json={"name": "   "})).status_code == 422
    grouped = await client.post(
        "/api/v1/operations", json={"name": "Сверление", "group_id": group["id"]}
    )
    assert grouped.status_code == 201, grouped.text
    standalone = await client.post("/api/v1/operations", json={"name": "Контроль"})
    assert standalone.status_code == 201
    unknown = await client.post(
        "/api/v1/operations", json={"name": "Неизвестная", "group_id": str(uuid.uuid4())}
    )
    assert unknown.status_code == 422
    filtered = (
        await client.get("/api/v1/operations", params={"group_id": group["id"], "page_size": 1})
    ).json()
    assert filtered["total"] == 1
    assert filtered["items"][0]["id"] == grouped.json()["id"]
    ungrouped = (await client.get("/api/v1/operations", params={"ungrouped": True})).json()
    assert [row["id"] for row in ungrouped["items"]] == [standalone.json()["id"]]
    renamed = await client.patch(
        f"/api/v1/operation-groups/{group['id']}", json={"name": "Мехобработка"}
    )
    assert renamed.status_code == 200
    moved = await client.patch(
        f"/api/v1/operations/{standalone.json()['id']}", json={"group_id": group["id"]}
    )
    assert moved.status_code == 200
    assert moved.json()["group_id"] == group["id"]
    removed = await client.delete(f"/api/v1/operation-groups/{group['id']}")
    assert removed.status_code == 204
    remaining = (await client.get("/api/v1/operations", params={"ungrouped": True})).json()
    assert remaining["total"] == 2
    assert all(row["group_id"] is None for row in remaining["items"])
    assert (await client.get("/api/v1/operation-groups")).json() == []
