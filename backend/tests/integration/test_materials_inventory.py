from decimal import Decimal

import pytest
from httpx import AsyncClient


async def create_material(
    client: AsyncClient, *, name: str = "Лист стали", initial: str = "10.500000"
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/materials",
        json={
            "name": name,
            "unit": "кг",
            "initial_quantity": initial,
            "price": "125.40",
            "url": "https://example.com/steel",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_create_and_list_material(client: AsyncClient) -> None:
    created = await create_material(client)
    assert Decimal(str(created["free_quantity"])) == Decimal("10.500000")
    assert Decimal(str(created["required_quantity"])) == 0
    assert Decimal(str(created["deficit_quantity"])) == 0

    response = await client.get("/api/v1/materials", params={"search": "стали"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["pages"] == 1
    assert body["items"][0]["id"] == created["id"]


@pytest.mark.asyncio
async def test_update_and_archive_material(client: AsyncClient) -> None:
    created = await create_material(client)
    response = await client.patch(
        f"/api/v1/materials/{created['id']}",
        json={"name": "Лист нержавеющей стали", "price": None},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Лист нержавеющей стали"
    assert response.json()["price"] is None

    archived = await client.post(f"/api/v1/materials/{created['id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["archived"] is True
    listed = await client.get("/api/v1/materials")
    assert listed.json()["total"] == 0


@pytest.mark.asyncio
async def test_receipt_consumption_and_history(client: AsyncClient) -> None:
    created = await create_material(client, initial="2.500000")
    material_id = created["id"]

    receipt = await client.post(
        f"/api/v1/materials/{material_id}/movements",
        json={"movement_type": "receipt", "quantity": "1.250000", "comment": "Поставка"},
    )
    assert receipt.status_code == 201
    assert Decimal(str(receipt.json()["balance_after"])) == Decimal("3.750000")

    consumption = await client.post(
        f"/api/v1/materials/{material_id}/movements",
        json={"movement_type": "consumption", "quantity": "0.750000"},
    )
    assert consumption.status_code == 201
    assert Decimal(str(consumption.json()["quantity"])) == Decimal("-0.750000")
    assert Decimal(str(consumption.json()["balance_after"])) == Decimal("3.000000")

    history = await client.get(f"/api/v1/materials/{material_id}/movements")
    assert history.status_code == 200
    assert history.json()["total"] == 3
    assert {item["movement_type"] for item in history.json()["items"]} == {
        "receipt",
        "consumption",
    }


@pytest.mark.asyncio
async def test_negative_balance_is_rejected_atomically(client: AsyncClient) -> None:
    created = await create_material(client, initial="1.000000")
    material_id = created["id"]
    response = await client.post(
        f"/api/v1/materials/{material_id}/movements",
        json={"movement_type": "consumption", "quantity": "2.000000"},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"

    material = await client.get(f"/api/v1/materials/{material_id}")
    assert Decimal(str(material.json()["free_quantity"])) == Decimal("1.000000")
    history = await client.get(f"/api/v1/materials/{material_id}/movements")
    assert history.json()["total"] == 1


@pytest.mark.asyncio
async def test_adjustment_accepts_signed_delta(client: AsyncClient) -> None:
    created = await create_material(client, initial="5.000000")
    response = await client.post(
        f"/api/v1/materials/{created['id']}/movements",
        json={"movement_type": "adjustment", "quantity": "-1.250000"},
    )
    assert response.status_code == 201
    assert Decimal(str(response.json()["balance_after"])) == Decimal("3.750000")


@pytest.mark.asyncio
async def test_duplicate_name_is_case_insensitive_conflict(client: AsyncClient) -> None:
    await create_material(client, name="Краска")
    response = await client.post(
        "/api/v1/materials",
        json={"name": "краска", "unit": "л", "initial_quantity": "0"},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"

