from decimal import Decimal

import pytest
from httpx import AsyncClient


async def create_item(
    client: AsyncClient,
    *,
    name: str = "Корпус редуктора",
    is_product: bool = False,
    initial: str = "4.500000",
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/manufactured-items",
        json={
            "name": name,
            "is_product": is_product,
            "unit": "шт",
            "initial_quantity": initial,
            "image": "https://example.com/item.png",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_create_list_and_filter_products(client: AsyncClient) -> None:
    semi_finished = await create_item(client)
    product = await create_item(client, name="Редуктор в сборе", is_product=True, initial="0")

    response = await client.get(
        "/api/v1/manufactured-items",
        params={"kind": "product", "availability": "out_of_stock"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == product["id"]
    assert body["items"][0]["is_product"] is True
    assert Decimal(str(body["items"][0]["required_quantity"])) == 0
    assert Decimal(str(body["items"][0]["to_produce_quantity"])) == 0

    search = await client.get("/api/v1/manufactured-items", params={"search": "КОРПУС"})
    assert search.status_code == 200
    assert search.json()["items"][0]["id"] == semi_finished["id"]


@pytest.mark.asyncio
async def test_update_archive_and_reject_movement_for_archived_item(
    client: AsyncClient,
) -> None:
    created = await create_item(client)
    response = await client.patch(
        f"/api/v1/manufactured-items/{created['id']}",
        json={"name": "Готовый корпус", "is_product": True, "image": None},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Готовый корпус"
    assert response.json()["is_product"] is True
    assert response.json()["image"] is None

    archived = await client.post(f"/api/v1/manufactured-items/{created['id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["archived"] is True
    listed = await client.get("/api/v1/manufactured-items")
    assert listed.json()["total"] == 0

    movement = await client.post(
        f"/api/v1/manufactured-items/{created['id']}/movements",
        json={"movement_type": "receipt", "quantity": "1"},
    )
    assert movement.status_code == 409


@pytest.mark.asyncio
async def test_receipt_consumption_adjustment_and_history(client: AsyncClient) -> None:
    created = await create_item(client, initial="2.500000")
    item_id = created["id"]

    receipt = await client.post(
        f"/api/v1/manufactured-items/{item_id}/movements",
        json={
            "movement_type": "receipt",
            "quantity": "1.250000",
            "comment": "Оприходование выпуска",
        },
    )
    assert receipt.status_code == 201
    assert Decimal(str(receipt.json()["balance_after"])) == Decimal("3.750000")

    consumption = await client.post(
        f"/api/v1/manufactured-items/{item_id}/movements",
        json={"movement_type": "consumption", "quantity": "0.750000"},
    )
    assert consumption.status_code == 201
    assert Decimal(str(consumption.json()["quantity"])) == Decimal("-0.750000")

    adjustment = await client.post(
        f"/api/v1/manufactured-items/{item_id}/movements",
        json={"movement_type": "adjustment", "quantity": "-0.250000"},
    )
    assert adjustment.status_code == 201
    assert Decimal(str(adjustment.json()["balance_after"])) == Decimal("2.750000")

    history = await client.get(f"/api/v1/manufactured-items/{item_id}/movements")
    assert history.status_code == 200
    assert history.json()["total"] == 4


@pytest.mark.asyncio
async def test_negative_balance_is_rejected_without_ledger_entry(
    client: AsyncClient,
) -> None:
    created = await create_item(client, initial="1.000000")
    response = await client.post(
        f"/api/v1/manufactured-items/{created['id']}/movements",
        json={"movement_type": "write_off", "quantity": "2.000000"},
    )
    assert response.status_code == 409
    item = await client.get(f"/api/v1/manufactured-items/{created['id']}")
    assert Decimal(str(item.json()["free_quantity"])) == Decimal("1.000000")
    history = await client.get(f"/api/v1/manufactured-items/{created['id']}/movements")
    assert history.json()["total"] == 1


@pytest.mark.asyncio
async def test_duplicate_name_is_case_insensitive_conflict(client: AsyncClient) -> None:
    await create_item(client, name="Вал ведущий")
    response = await client.post(
        "/api/v1/manufactured-items",
        json={
            "name": "вал ВЕДУЩИЙ",
            "is_product": False,
            "unit": "шт",
        },
    )
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"
