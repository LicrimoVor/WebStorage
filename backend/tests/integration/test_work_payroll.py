from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient


async def create_operation(
    client: AsyncClient,
    *,
    name: str,
    time_norm: str | None = "5",
    rate: str | None = "10",
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/operations",
        json={
            "name": name,
            "time_norm": time_norm,
            "price_per_operation": rate,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_employee(client: AsyncClient, *, name: str) -> dict[str, Any]:
    response = await client.post("/api/v1/employees", json={"full_name": name})
    assert response.status_code == 201, response.text
    return response.json()


async def record_work(
    client: AsyncClient,
    *,
    operation_id: str,
    employee_id: str,
    mode: str,
    value: str,
    performed_at: str = "2026-08-20T08:00:00Z",
) -> dict[str, Any]:
    response = await client.post(
        f"/api/v1/operations/{operation_id}/work-entries",
        json={
            "employee_id": employee_id,
            "input_mode": mode,
            "input_value": value,
            "performed_at": performed_at,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_quantity_and_time_work_use_historical_snapshots_and_projections(
    client: AsyncClient,
) -> None:
    employee = await create_employee(client, name="Anna Smith")
    operation = await create_operation(
        client, name="Assembly", time_norm="3.5", rate="12.40"
    )
    quantity_entry = await record_work(
        client,
        operation_id=operation["id"],
        employee_id=employee["id"],
        mode="quantity",
        value="3",
    )
    assert Decimal(quantity_entry["equivalent_quantity"]) == Decimal("3")
    assert Decimal(quantity_entry["time_minutes"]) == Decimal("10.5")
    assert Decimal(quantity_entry["accrued_amount"]) == Decimal("37.20")

    time_entry = await record_work(
        client,
        operation_id=operation["id"],
        employee_id=employee["id"],
        mode="time",
        value="7",
        performed_at="2026-08-20T09:00:00Z",
    )
    assert Decimal(time_entry["equivalent_quantity"]) == Decimal("2")
    assert Decimal(time_entry["accrued_amount"]) == Decimal("24.80")

    changed = await client.patch(
        f"/api/v1/operations/{operation['id']}",
        json={"time_norm": "10", "price_per_operation": "99"},
    )
    assert changed.status_code == 200
    edited = await client.patch(
        f"/api/v1/work-entries/{time_entry['id']}", json={"input_value": "10.5"}
    )
    assert edited.status_code == 200, edited.text
    assert Decimal(edited.json()["time_norm_snapshot"]) == Decimal("3.5")
    assert Decimal(edited.json()["rate_snapshot"]) == Decimal("12.40")
    assert Decimal(edited.json()["equivalent_quantity"]) == Decimal("3")
    assert Decimal(edited.json()["accrued_amount"]) == Decimal("37.20")

    employee_read = await client.get(f"/api/v1/employees/{employee['id']}")
    assert Decimal(employee_read.json()["accrued_total"]) == Decimal("74.40")
    assert Decimal(employee_read.json()["completed_operations"]) == Decimal("6")
    operation_read = await client.get(f"/api/v1/operations/{operation['id']}")
    assert Decimal(operation_read.json()["completed_quantity"]) == Decimal("6")


@pytest.mark.asyncio
async def test_missing_rate_or_time_norm_keeps_work_without_false_accrual(
    client: AsyncClient,
) -> None:
    employee = await create_employee(client, name="No Rate")
    operation = await create_operation(
        client, name="Unpriced work", time_norm=None, rate=None
    )
    entry = await record_work(
        client,
        operation_id=operation["id"],
        employee_id=employee["id"],
        mode="time",
        value="45",
    )
    assert entry["equivalent_quantity"] is None
    assert entry["accrued_amount"] is None
    assert "time norm" in entry["calculation_message"]
    assert "rate" in entry["calculation_message"]


@pytest.mark.asyncio
async def test_fifo_and_manual_partial_payments_allocate_exactly(
    client: AsyncClient,
) -> None:
    employee = await create_employee(client, name="Paid Employee")
    operation = await create_operation(client, name="Packing", rate="10")
    first = await record_work(
        client,
        operation_id=operation["id"],
        employee_id=employee["id"],
        mode="quantity",
        value="2",
        performed_at="2026-08-20T08:00:00Z",
    )
    second = await record_work(
        client,
        operation_id=operation["id"],
        employee_id=employee["id"],
        mode="quantity",
        value="3",
        performed_at="2026-08-21T08:00:00Z",
    )
    fifo = await client.post(
        f"/api/v1/employees/{employee['id']}/payments",
        json={"amount": "25", "comment": "Advance"},
    )
    assert fifo.status_code == 201, fifo.text
    assert fifo.json()["allocation_mode"] == "fifo"
    actual_allocations = [
        (item["work_entry_id"], Decimal(item["amount"]))
        for item in fifo.json()["allocations"]
    ]
    assert actual_allocations == [
        (first["id"], Decimal("20")),
        (second["id"], Decimal("5")),
    ]

    manual = await client.post(
        f"/api/v1/employees/{employee['id']}/payments",
        json={
            "amount": "10",
            "allocations": [{"work_entry_id": second["id"], "amount": "10"}],
        },
    )
    assert manual.status_code == 201, manual.text
    assert manual.json()["allocation_mode"] == "manual"
    summary = await client.get(
        f"/api/v1/employees/{employee['id']}/payroll-summary"
    )
    assert summary.status_code == 200
    assert Decimal(summary.json()["accrued_total"]) == Decimal("50")
    assert Decimal(summary.json()["paid_total"]) == Decimal("35")
    assert Decimal(summary.json()["payable_total"]) == Decimal("15")
    listed = await client.get(f"/api/v1/employees/{employee['id']}/payments")
    assert listed.json()["total"] == 2


@pytest.mark.asyncio
async def test_paid_work_is_protected_and_unpaid_work_can_be_voided(
    client: AsyncClient,
) -> None:
    employee = await create_employee(client, name="Protected History")
    operation = await create_operation(client, name="Inspection", rate="5")
    paid = await record_work(
        client,
        operation_id=operation["id"],
        employee_id=employee["id"],
        mode="quantity",
        value="1",
    )
    payment = await client.post(
        f"/api/v1/employees/{employee['id']}/payments", json={"amount": "5"}
    )
    assert payment.status_code == 201
    assert (
        await client.patch(
            f"/api/v1/work-entries/{paid['id']}", json={"input_value": "2"}
        )
    ).status_code == 409
    assert (
        await client.post(
            f"/api/v1/work-entries/{paid['id']}/void", json={"reason": "mistake"}
        )
    ).status_code == 409

    unpaid = await record_work(
        client,
        operation_id=operation["id"],
        employee_id=employee["id"],
        mode="quantity",
        value="2",
    )
    voided = await client.post(
        f"/api/v1/work-entries/{unpaid['id']}/void", json={"reason": "Duplicate"}
    )
    assert voided.status_code == 200, voided.text
    assert voided.json()["voided_at"] is not None
    history = await client.get(
        f"/api/v1/employees/{employee['id']}/work-entries",
        params={"include_voided": "true"},
    )
    assert history.json()["total"] == 2
    active_history = await client.get(
        f"/api/v1/employees/{employee['id']}/work-entries"
    )
    assert active_history.json()["total"] == 1


@pytest.mark.asyncio
async def test_payment_cannot_exceed_payable_amount(client: AsyncClient) -> None:
    employee = await create_employee(client, name="No Overpayment")
    operation = await create_operation(client, name="Cutting", rate="10")
    await record_work(
        client,
        operation_id=operation["id"],
        employee_id=employee["id"],
        mode="quantity",
        value="1",
    )
    response = await client.post(
        f"/api/v1/employees/{employee['id']}/payments", json={"amount": "10.01"}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_hourly_employee_is_paid_by_time_and_tracks_paid_equivalent(
    client: AsyncClient,
) -> None:
    employee_response = await client.post(
        "/api/v1/employees",
        json={
            "full_name": "Hourly Operator",
            "compensation_type": "hourly",
            "hourly_rate": "600",
        },
    )
    assert employee_response.status_code == 201, employee_response.text
    employee = employee_response.json()
    operation = await create_operation(
        client, name="Hourly assembly", time_norm="5", rate="999"
    )

    rejected = await client.post(
        f"/api/v1/operations/{operation['id']}/work-entries",
        json={
            "employee_id": employee["id"],
            "input_mode": "quantity",
            "input_value": "6",
        },
    )
    assert rejected.status_code == 422

    entry = await record_work(
        client,
        operation_id=operation["id"],
        employee_id=employee["id"],
        mode="time",
        value="30",
    )
    assert entry["compensation_type_snapshot"] == "hourly"
    assert Decimal(entry["equivalent_quantity"]) == Decimal("6")
    assert Decimal(entry["rate_snapshot"]) == Decimal("600")
    assert Decimal(entry["accrued_amount"]) == Decimal("300")

    payment = await client.post(
        f"/api/v1/employees/{employee['id']}/payments", json={"amount": "150"}
    )
    assert payment.status_code == 201, payment.text
    summary = (
        await client.get(f"/api/v1/employees/{employee['id']}/payroll-summary")
    ).json()
    assert Decimal(summary["completed_operations"]) == Decimal("6")
    assert Decimal(summary["paid_operations_equivalent"]) == Decimal("3")
    assert Decimal(summary["operations"][0]["paid_quantity_equivalent"]) == Decimal(
        "3"
    )
    employee_read = (await client.get(f"/api/v1/employees/{employee['id']}")).json()
    assert employee_read["compensation_type"] == "hourly"
    assert Decimal(employee_read["paid_operations_equivalent"]) == Decimal("3")
