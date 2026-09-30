import uuid
from decimal import Decimal

from app.core.security import Actor, Role, get_current_actor
from app.main import app
from httpx import AsyncClient
from tests.integration.test_business_workflows import post, setup_catalog
from tests.integration.test_exports import NS, inline_text, rows, worksheet
from tests.integration.test_sales_finance import create_item
from tests.integration.test_work_payroll import create_employee, record_work


async def test_split_receipt_filters_history_and_source_lifecycle(client: AsyncClient) -> None:
    source, material, _, _ = await setup_catalog(client)
    second = await post(client, "/funding-sources", {"name": "Second"})
    parts = [
        {"funding_source_id": source["id"], "amount": "60.25"},
        {"funding_source_id": second["id"], "amount": "39.75"},
    ]
    payload = {
        "funding_source_id": source["id"],
        "funding_allocations": parts,
        "total_amount": "100",
        "occurred_at": "2026-09-30T10:00:00Z",
        "entries": [{"material_id": material["id"], "quantity": "2"}],
    }
    key = str(uuid.uuid4())
    document = await post(client, "/warehouse/receipts", payload, key)
    assert (await post(client, "/warehouse/receipts", payload, key))["id"] == document["id"]
    for source_id, amount in [(None, "100"), (source["id"], "60.25"), (second["id"], "39.75")]:
        params = {"funding_source_id": source_id} if source_id else {}
        response = await client.get("/api/v1/finance/summary", params=params)
        assert response.status_code == 200, response.text
        assert Decimal(response.json()["total_expense"]) == Decimal(amount)
        entries = (await client.get("/api/v1/finance/entries", params=params)).json()["items"]
        assert len(entries) == 1
        assert Decimal(entries[0]["amount"]) == Decimal(amount)
        assert entries[0]["created_by"] == "local-development"
        assert len(entries[0]["funding_allocations"]) == 2
    rename = await client.patch(f"/api/v1/funding-sources/{second['id']}", json={"name": "Updated"})
    assert rename.status_code == 200
    assert (await client.delete(f"/api/v1/funding-sources/{second['id']}")).status_code == 204
    rejected = await client.post(
        "/api/v1/warehouse/receipts", json=payload, headers={"Idempotency-Key": str(uuid.uuid4())}
    )
    assert rejected.status_code == 422
    assert (await post(client, "/warehouse/receipts", payload, key))["id"] == document["id"]
    assert Decimal((await client.get("/api/v1/finance/summary")).json()["total_expense"]) == 100


async def test_invalid_splits_are_atomic_and_author_is_admin_only(client: AsyncClient) -> None:
    source, _, _, _ = await setup_catalog(client)
    second = await post(client, "/funding-sources", {"name": "Second"})
    base = {
        "funding_source_id": source["id"],
        "amount": "10",
        "transaction_type": "expense",
        "category": "Test",
    }
    for parts in [
        [{"funding_source_id": source["id"], "amount": "9"}],
        [{"funding_source_id": source["id"], "amount": "5"}] * 2,
        [
            {"funding_source_id": source["id"], "amount": "5"},
            {"funding_source_id": str(uuid.uuid4()), "amount": "5"},
        ],
    ]:
        response = await client.post(
            "/api/v1/finance/transactions", json={**base, "funding_allocations": parts}
        )
        assert response.status_code == 422, response.text
    assert (await client.get("/api/v1/finance/entries")).json()["total"] == 0
    await post(
        client,
        "/finance/transactions",
        {
            **base,
            "funding_allocations": [
                {"funding_source_id": source["id"], "amount": "4"},
                {"funding_source_id": second["id"], "amount": "6"},
            ],
        },
    )
    actor = Actor("operator", frozenset({Role.FINANCE}), frozenset({"finance"}))
    app.dependency_overrides[get_current_actor] = lambda: actor
    try:
        entries = (await client.get("/api/v1/finance/entries")).json()["items"]
        assert "created_by" not in entries[0]
        exported = await client.get(
            "/api/v1/exports/finance_entries.xlsx", params={"funding_source_id": second["id"]}
        )
        assert exported.status_code == 200, exported.text
        exported_rows = rows(worksheet(exported.content))
        assert "Автор" not in [inline_text(cell) for cell in exported_rows[0]]
        assert any(
            Decimal(cell.findtext("x:v", default="0", namespaces=NS)) == 6
            for cell in exported_rows[1]
        )
    finally:
        app.dependency_overrides.pop(get_current_actor, None)


async def test_split_sales_payroll_repair_and_manual_receipt(client: AsyncClient) -> None:
    source, material, _, operation = await setup_catalog(client)
    second = await post(client, "/funding-sources", {"name": "Second"})
    funding = {
        "funding_source_id": source["id"],
        "funding_allocations": [
            {"funding_source_id": source["id"], "amount": "4"},
            {"funding_source_id": second["id"], "amount": "6"},
        ],
    }
    movement = await post(
        client,
        f"/materials/{material['id']}/movements",
        {
            **funding,
            "movement_type": "receipt",
            "quantity": "1",
        },
    )
    assert len(movement["funding_allocations"]) == 2
    employee = await create_employee(client, name="Worker")
    await record_work(
        client, operation_id=operation["id"], employee_id=employee["id"], mode="quantity", value="2"
    )
    payment = await post(
        client, f"/employees/{employee['id']}/payments", {**funding, "amount": "10"}
    )
    assert len(payment["funding_allocations"]) == 2
    product = await create_item(client, name="Product")
    sale_payload = {**funding, "product_id": product["id"], "quantity": "1", "unit_price": "10"}
    key = str(uuid.uuid4())
    sale = await post(client, "/sales", sale_payload, key)
    assert len(sale["funding_allocations"]) == 2
    assert (await post(client, "/sales", sale_payload, key))["id"] == sale["id"]
    await post(
        client,
        "/repairs",
        {
            **funding,
            "service_cost": "10",
            "serial_number": "N1",
            "comment": "Repair",
            "occurred_at": "2026-09-30T10:00:00Z",
            "materials": [{"material_id": material["id"], "quantity": "1"}],
            "operations": [{"operation_id": operation["id"], "quantity": "1"}],
        },
    )
    result = (
        await client.get("/api/v1/finance/summary", params={"funding_source_id": second["id"]})
    ).json()
    for field in ["sales_income", "material_expense", "labour_expense", "repair_expense"]:
        assert Decimal(result[field]) == 6, result
    assert Decimal(result["total_expense"]) == 18
    entries = (await client.get("/api/v1/finance/entries")).json()["items"]
    manual_receipt = next(entry for entry in entries if entry["source_type"] == "material")
    assert manual_receipt["created_by"] == "local-development"
