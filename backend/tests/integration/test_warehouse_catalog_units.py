import uuid
from decimal import Decimal

from httpx import AsyncClient

from tests.integration.test_business_workflows import post, setup_catalog


async def test_shared_catalog_groups_pagination_and_byproduct_sales(client: AsyncClient) -> None:
    source, material, product, _ = await setup_catalog(client)
    root = await post(client, '/inventory-groups', {'name': 'Root'})
    child = await post(client, '/inventory-groups', {'name': 'Child', 'parent_id': root['id']})
    await client.patch(f"/api/v1/materials/{material['id']}", json={'group_ids': [child['id']]})
    semi = await post(client, '/manufactured-items', {'name': 'Semi', 'is_product': False, 'product_id': product['id'], 'unit': 'pcs', 'initial_quantity': '5'})
    assert semi['groups'] == []
    await client.patch(f"/api/v1/manufactured-items/{semi['id']}", json={'group_ids': [root['id'], child['id']], 'is_byproduct': True})
    for group in [root, child]:
        response = await client.get('/api/v1/warehouse/catalog', params={'group_id': group['id']})
        assert response.status_code == 200, response.text
        catalog = response.json()
        assert catalog['total'] == 2
        assert {r['kind'] for r in catalog['items']} == {'material', 'semi_finished'}
    filtered = (await client.get('/api/v1/warehouse/catalog', params={'kind': 'semi_finished', 'availability': 'in_stock', 'group_id': root['id']})).json()
    assert [r['id'] for r in filtered['items']] == [semi['id']]
    assert (await client.get('/api/v1/warehouse/catalog', params={'kind': 'product'})).json()['total'] == 1
    first = (await client.get('/api/v1/warehouse/catalog?page_size=1&page=1')).json()
    second = (await client.get('/api/v1/warehouse/catalog?page_size=1&page=2')).json()
    assert first['total'] == second['total'] == 2
    assert first['items'][0]['id'] != second['items'][0]['id']
    sale = {'product_id': semi['id'], 'quantity': '2', 'unit_price': '10', 'funding_source_id': source['id']}
    await post(client, '/sales', sale)
    assert Decimal((await client.get(f"/api/v1/manufactured-items/{semi['id']}")).json()['free_quantity']) == 3
    await client.patch(f"/api/v1/manufactured-items/{semi['id']}", json={'is_byproduct': False})
    rejected = await client.post('/api/v1/sales', json=sale, headers={'Idempotency-Key': str(uuid.uuid4())})
    assert rejected.status_code == 422


async def test_anonymous_and_named_units_release_sale_and_retry(client: AsyncClient) -> None:
    source, material, product, _ = await setup_catalog(client)
    await post(client, f"/materials/{material['id']}/movements", {'movement_type': 'receipt', 'quantity': '20', 'funding_source_id': source['id']})
    process = await post(client, '/technological-processes/import', {
        'name': 'Assembly', 'outputItemId': product['id'],
        'nodes': [{'id': 'm', 'type': 'material', 'referenceId': material['id']}, {'id': 'o', 'type': 'output', 'referenceId': product['id']}],
        'edges': [{'id': 'a', 'source': 'm', 'target': 'o', 'quantity': '1'}],
    })
    activated = await client.post(f"/api/v1/technological-processes/{process['process']['id']}/versions/{process['version']['id']}/activate")
    assert activated.status_code == 200
    path = f"/manufactured-items/{product['id']}/produce"
    key = str(uuid.uuid4())
    payload = {'quantity': '3', 'serial_numbers': ['N1', '']}
    first = await post(client, path, payload, key)
    assert (await post(client, path, payload, key))['id'] == first['id']
    units = (await client.get('/api/v1/product-units', params={'product_id': product['id']})).json()
    assert len(units) == 3
    assert sum(u['serial_number'] is None for u in units) == 2
    assert len({u['id'] for u in units}) == 3
    sale = {'product_id': product['id'], 'quantity': '1', 'unit_price': '10', 'funding_source_id': source['id']}
    await post(client, '/sales', sale)
    await post(client, '/sales', sale)
    rejected = await client.post('/api/v1/sales', json=sale, headers={'Idempotency-Key': str(uuid.uuid4())})
    assert rejected.status_code == 422
    await post(client, '/sales', {**sale, 'serial_numbers': ['N1']})
    await post(client, path, {'quantity': '2'})
    units = (await client.get('/api/v1/product-units', params={'product_id': product['id']})).json()
    assert len(units) == 5
    assert sum(u['sale_id'] is not None for u in units) == 3
    invalid = await client.post('/api/v1' + path, json={'quantity': '1', 'serial_numbers': ['X', 'Y']}, headers={'Idempotency-Key': str(uuid.uuid4())})
    assert invalid.status_code == 422
