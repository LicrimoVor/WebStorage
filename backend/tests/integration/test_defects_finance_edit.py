import asyncio
import uuid
from decimal import Decimal

from httpx import AsyncClient

from app.core.security import Actor, Role, get_current_actor
from app.main import app
from tests.integration.test_business_workflows import post, setup_catalog
from tests.integration.test_sales_finance import create_item
from tests.integration.test_work_payroll import create_employee, record_work


async def test_defect_transfers_are_atomic_reversible_and_idempotent(client: AsyncClient) -> None:
    source, material, _, _ = await setup_catalog(client)
    await post(client, '/warehouse/receipts', {
        'funding_source_id': source['id'], 'total_amount': '100',
        'occurred_at': '2026-09-30T10:00:00Z',
        'entries': [{'material_id': material['id'], 'quantity': '10'}],
    })
    defects = [await post(client, '/materials', {
        'name': name, 'unit': 'wrong', 'price': '999', 'source_material_id': material['id'],
    }) for name in ['Bent', 'Scratched']]
    assert all(d['unit'] == material['unit'] and d['price'] == material['price'] for d in defects)
    nested = await client.post('/api/v1/materials', json={
        'name': 'Nested', 'unit': 'kg', 'source_material_id': defects[0]['id'],
    })
    assert nested.status_code == 422
    url = f"/api/v1/materials/{material['id']}/defect-transfers"
    payload = {'request_id': str(uuid.uuid4()), 'entries': [
        {'material_id': d['id'], 'quantity': '3', 'comment': 'Inspection'} for d in defects
    ]}
    results = await asyncio.gather(client.post(url, json=payload), client.post(url, json=payload))
    assert [r.status_code for r in results] == [204, 204]
    async def balance(item: dict) -> Decimal:
        return Decimal((await client.get(f"/api/v1/materials/{item['id']}")).json()['free_quantity'])
    assert await balance(material) == 4
    assert await balance(defects[0]) == 3
    rejected = await client.post(url, json={**payload, 'request_id': str(uuid.uuid4())})
    assert rejected.status_code == 409
    assert await balance(material) == 4
    assert await balance(defects[0]) == 3
    reverse = await client.post(f"/api/v1/materials/{defects[0]['id']}/defect-transfers", json={
        'request_id': str(uuid.uuid4()), 'entries': [{'material_id': material['id'], 'quantity': '2', 'comment': 'Restored'}],
    })
    assert reverse.status_code == 204
    assert await balance(material) == 6
    assert await balance(defects[0]) == 1
    movements = (await client.get(f"/api/v1/materials/{material['id']}/movements")).json()['items']
    assert any(m['source_type'] == 'defect_recovery' and m['comment'] == 'Restored' for m in movements)
    assert Decimal((await client.get('/api/v1/finance/summary')).json()['total_expense']) == 100


async def test_finance_edit_permissions_history_conflicts_and_receipt(client: AsyncClient) -> None:
    source, material, _, _ = await setup_catalog(client)
    second = await post(client, '/funding-sources', {'name': 'Second'})
    document = await post(client, '/warehouse/receipts', {
        'funding_source_id': source['id'], 'total_amount': '100',
        'occurred_at': '2026-09-30T10:00:00Z',
        'entries': [{'material_id': material['id'], 'quantity': '10'}],
    })
    url = f"/api/v1/finance/entries/{document['id']}"
    payload = {'revision': 0, 'amount': '120', 'occurred_at': '2026-09-30T12:00:00Z',
               'comment': 'Corrected', 'reason': 'Invoice', 'funding_source_id': source['id'],
               'funding_allocations': [{'funding_source_id': source['id'], 'amount': '70'},
                                       {'funding_source_id': second['id'], 'amount': '50'}]}
    app.dependency_overrides[get_current_actor] = lambda: Actor(subject='financier', roles=frozenset({Role.FINANCE}))
    try:
        assert (await client.get(url)).status_code == 403
        assert (await client.patch(url, json=payload)).status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_actor)
    edited = await client.patch(url, json=payload)
    assert edited.status_code == 200, edited.text
    result = edited.json()
    assert result['revision'] == 1
    assert Decimal(result['history'][0]['before']['amount']) == 100
    assert Decimal(result['history'][0]['after']['amount']) == 120
    assert result['history'][0]['created_by'] == 'local-development'
    assert (await client.patch(url, json=payload)).status_code == 409
    summary = (await client.get('/api/v1/finance/summary', params={'funding_source_id': second['id']})).json()
    assert Decimal(summary['total_expense']) == 50
    assert Decimal((await client.get(f"/api/v1/materials/{material['id']}")).json()['free_quantity']) == 10
    documents = (await client.get('/api/v1/business-documents?kind=receipt')).json()
    assert documents[0]['total_amount'] == '120'


async def test_edit_sale_payment_repair_and_manual_transaction(client: AsyncClient) -> None:
    source, material, _, operation = await setup_catalog(client)
    funding = {'funding_source_id': source['id']}
    movement = await post(client, f"/materials/{material['id']}/movements", {
        **funding, 'movement_type': 'receipt', 'quantity': '2',
    })
    employee = await create_employee(client, name='Worker')
    await record_work(client, operation_id=operation['id'], employee_id=employee['id'], mode='quantity', value='4')
    payment = await post(client, f"/employees/{employee['id']}/payments", {**funding, 'amount': '10'})
    product = await create_item(client, name='Product')
    sale = await post(client, '/sales', {**funding, 'product_id': product['id'], 'quantity': '1', 'unit_price': '10'})
    repair = await post(client, '/repairs', {
        **funding, 'service_cost': '10', 'serial_number': 'N1', 'comment': 'Repair',
        'occurred_at': '2026-09-30T10:00:00Z',
        'materials': [{'material_id': material['id'], 'quantity': '1'}],
        'operations': [{'operation_id': operation['id'], 'quantity': '1'}],
    })
    manual = await post(client, '/finance/transactions', {**funding, 'amount': '10', 'transaction_type': 'expense', 'category': 'Other'})
    repair_entry = next(e for e in (await client.get('/api/v1/finance/entries')).json()['items'] if e['source_type'] == 'repair')
    payload = {**funding, 'amount': '15', 'occurred_at': '2026-09-30T12:00:00Z', 'comment': 'Updated', 'reason': 'Correction', 'revision': 0}
    for entry in [movement, payment, sale, repair_entry, manual]:
        response = await client.patch(f"/api/v1/finance/entries/{entry['id']}", json=payload)
        assert response.status_code == 200, response.text
        assert Decimal(response.json()['entry']['amount']) == 15
        assert response.json()['revision'] == 1
    rejected = await client.patch(f"/api/v1/finance/entries/{payment['id']}", json={**payload, 'amount': '999', 'revision': 1})
    assert rejected.status_code == 422
    payments = (await client.get(f"/api/v1/employees/{employee['id']}/payments")).json()['items']
    assert Decimal(payments[0]['amount']) == 15
    assert sum(Decimal(a['amount']) for a in payments[0]['allocations']) == 15
    repairs = (await client.get('/api/v1/business-documents?kind=repair')).json()
    assert repairs[0]['id'] == repair['id']
    assert Decimal(repairs[0]['service_cost']) == 15
