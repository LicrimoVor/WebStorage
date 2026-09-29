import uuid
from decimal import Decimal

from httpx import AsyncClient
from tests.integration.test_business_workflows import post, setup_catalog


async def test_partial_receipt_total_and_defects_are_counted_once(client: AsyncClient) -> None:
    source, material, _, _ = await setup_catalog(client)
    other = await post(client, '/materials', {'name': 'Other', 'unit': 'pcs'})
    untouched = await post(client, '/materials', {'name': 'Untouched', 'unit': 'pcs'})
    payload = {
        'funding_source_id': source['id'], 'occurred_at': '2026-09-29T10:00:00Z',
        'total_amount': '123.45', 'entries': [
            {'material_id': material['id'], 'quantity': '10', 'defective_quantity': '2'},
            {'material_id': other['id'], 'quantity': '5'},
        ],
    }
    key = str(uuid.uuid4())
    first = await post(client, '/warehouse/receipts', payload, key)
    repeated = await post(client, '/warehouse/receipts', payload, key)
    assert first['id'] == repeated['id']
    assert Decimal(first['total_amount']) == Decimal('123.45')
    stock = (await client.get(f"/api/v1/materials/{material['id']}")).json()
    assert Decimal(stock['free_quantity']) == 8
    assert Decimal(stock['defective_quantity']) == 2
    rows = (await client.get('/api/v1/materials')).json()['items']
    listed = next(row for row in rows if row['id'] == material['id'])
    assert Decimal(listed['defective_quantity']) == 2
    assert Decimal(next(row for row in rows if row['id'] == untouched['id'])['free_quantity']) == 0
    summary = (await client.get('/api/v1/finance/summary')).json()
    assert Decimal(summary['material_expense']) == Decimal('123.45')
    assert Decimal(summary['total_expense']) == Decimal('123.45')
    assert summary['incomplete_material_movements'] == 0
    entries = (await client.get('/api/v1/finance/entries?source=material')).json()['items']
    assert len(entries) == 1
    assert Decimal(entries[0]['amount']) == Decimal('123.45')
    assert entries[0]['funding_source_id'] == source['id']
    another_source = await post(client, '/funding-sources', {'name': 'Other account'})
    filtered = (await client.get(
        f"/api/v1/finance/summary?funding_source_id={another_source['id']}"
    )).json()
    assert Decimal(filtered['material_expense']) == 0


async def test_receipt_requires_amount_and_valid_defects(client: AsyncClient) -> None:
    source, material, _, _ = await setup_catalog(client)
    payload = {'funding_source_id': source['id'], 'occurred_at': '2026-09-29T10:00:00Z',
               'entries': [{'material_id': material['id'], 'quantity': '1'}]}
    response = await client.post('/api/v1/warehouse/receipts', json=payload,
                                 headers={'Idempotency-Key': str(uuid.uuid4())})
    assert response.status_code == 422
    payload['total_amount'] = '10'
    payload['entries'][0]['defective_quantity'] = '2'
    response = await client.post('/api/v1/warehouse/receipts', json=payload,
                                 headers={'Idempotency-Key': str(uuid.uuid4())})
    assert response.status_code == 422
