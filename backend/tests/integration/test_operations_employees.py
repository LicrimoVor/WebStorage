from decimal import Decimal

import pytest
from httpx import AsyncClient


async def create_operation(
    client: AsyncClient,
    *,
    name: str = "Сверление",
    time_norm: str | None = "3.500000",
    price: str | None = "12.40",
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/operations",
        json={
            "name": name,
            "time_norm": time_norm,
            "price_per_operation": price,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_employee(
    client: AsyncClient,
    *,
    full_name: str = "Иванов Иван Иванович",
    comment: str | None = "Сварочный участок",
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/employees",
        json={"full_name": full_name, "comment": comment},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_operation_crud_search_and_computed_fields(client: AsyncClient) -> None:
    created = await create_operation(client)
    assert Decimal(str(created["time_norm"])) == Decimal("3.500000")
    assert Decimal(str(created["price_per_operation"])) == Decimal("12.40")
    assert Decimal(str(created["required_quantity"])) == 0
    assert Decimal(str(created["completed_quantity"])) == 0
    assert Decimal(str(created["required_time_minutes"])) == 0

    listed = await client.get("/api/v1/operations", params={"search": "СВЕРЛ"})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == created["id"]

    updated = await client.patch(
        f"/api/v1/operations/{created['id']}",
        json={"time_norm": "4.000000", "price_per_operation": None},
    )
    assert updated.status_code == 200
    assert Decimal(str(updated.json()["time_norm"])) == 4
    assert updated.json()["price_per_operation"] is None


@pytest.mark.asyncio
async def test_operation_validation_duplicate_and_archive(client: AsyncClient) -> None:
    created = await create_operation(client, name="Резка")
    invalid = await client.post(
        "/api/v1/operations",
        json={"name": "Покраска", "time_norm": "0", "price_per_operation": "-1"},
    )
    assert invalid.status_code == 422

    duplicate = await client.post(
        "/api/v1/operations", json={"name": "резка"}
    )
    assert duplicate.status_code == 409

    archived = await client.post(f"/api/v1/operations/{created['id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["archived"] is True
    listed = await client.get("/api/v1/operations")
    assert listed.json()["total"] == 0


@pytest.mark.asyncio
async def test_employee_crud_search_and_aggregate_placeholders(
    client: AsyncClient,
) -> None:
    created = await create_employee(client)
    assert created["active"] is True
    assert Decimal(str(created["accrued_total"])) == 0
    assert Decimal(str(created["paid_total"])) == 0
    assert Decimal(str(created["payable_total"])) == 0
    assert Decimal(str(created["completed_operations"])) == 0

    listed = await client.get("/api/v1/employees", params={"search": "ИВАНОВ"})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == created["id"]

    updated = await client.patch(
        f"/api/v1/employees/{created['id']}",
        json={"full_name": "Иванов И. И.", "comment": None},
    )
    assert updated.status_code == 200
    assert updated.json()["full_name"] == "Иванов И. И."
    assert updated.json()["comment"] is None


@pytest.mark.asyncio
async def test_employee_archive_and_include_inactive(client: AsyncClient) -> None:
    created = await create_employee(client)
    archived = await client.post(f"/api/v1/employees/{created['id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["active"] is False
    assert (await client.get("/api/v1/employees")).json()["total"] == 0

    included = await client.get(
        "/api/v1/employees", params={"include_inactive": "true"}
    )
    assert included.status_code == 200
    assert included.json()["total"] == 1


@pytest.mark.asyncio
async def test_employees_allow_same_full_name_and_paginate(client: AsyncClient) -> None:
    first = await create_employee(client, comment="Первая смена")
    second = await create_employee(client, comment="Вторая смена")
    assert first["id"] != second["id"]

    page = await client.get(
        "/api/v1/employees", params={"page": 2, "page_size": 1}
    )
    assert page.status_code == 200
    assert page.json()["total"] == 2
    assert page.json()["pages"] == 2
    assert len(page.json()["items"]) == 1
