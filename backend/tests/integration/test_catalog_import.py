import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_warehouse_import_links_groups_products_and_balances(client: AsyncClient) -> None:
    response = await client.post('/api/v1/warehouse/import', json={
        'version': 1,
        'materials': [{'name': 'Sheet', 'unit': 'pcs', 'group': ['Metal', 'Sheets'],
                       'initial_quantity': '10', 'price': '12.50'}],
        'products': [{'name': 'Case', 'unit': 'pcs'}],
        'semi_finished': [{'name': 'Blank', 'unit': 'pcs', 'product': 'Case',
                           'group': ['Metal', 'Sheets']}],
    })
    assert response.status_code == 201, response.text
    assert response.json()['created'] == 3
    materials = (await client.get('/api/v1/materials')).json()['items']
    assert materials[0]['name'] == 'Sheet'
    groups = (await client.get('/api/v1/inventory-groups')).json()
    parent = next(g for g in groups if g['name'] == 'Metal')
    child = next(g for g in groups if g['name'] == 'Sheets')
    assert child['parent_id'] == parent['id']
    items = (await client.get('/api/v1/manufactured-items')).json()['items']
    product = next(i for i in items if i['name'] == 'Case')
    assert next(i for i in items if i['name'] == 'Blank')['product_id'] == product['id']
    assert next(i for i in items if i['name'] == 'Blank')['groups'][0]['id'] == child['id']
    preview = await client.post('/api/v1/warehouse/import/preview', json={
        'version': 1, 'materials': [{'name': 'Other', 'unit': 'pcs',
                                   'group': ['metal', 'sheets']}],
    })
    assert preview.json()['new_groups'] == []
    conflict = await client.post('/api/v1/warehouse/import/preview', json={
        'version': 1, 'materials': [{'name': 'Other', 'unit': 'pcs',
                                   'group': ['Other parent', 'Sheets']}],
    })
    assert conflict.status_code == 200
    assert conflict.json()['new_groups'] == [['Other parent'], ['Other parent', 'Sheets']]


@pytest.mark.asyncio
async def test_import_same_child_name_under_different_parents(client: AsyncClient) -> None:
    payload = {'version': 1, 'materials': [
        {'name': 'A', 'unit': 'pcs', 'group': ['Metal', 'Other']},
        {'name': 'B', 'unit': 'pcs', 'group': ['Plastic', 'Other']},
        {'name': 'C', 'unit': 'pcs', 'group': ['metal', 'OTHER']},
        {'name': 'D', 'unit': 'pcs', 'group': ['Other', 'Other']},
    ]}
    preview = await client.post('/api/v1/warehouse/import/preview', json=payload)
    assert preview.json()['new_groups'] == [
        ['Metal'], ['Metal', 'Other'], ['Plastic'], ['Plastic', 'Other'],
        ['Other'], ['Other', 'Other'],
    ]
    response = await client.post('/api/v1/warehouse/import', json=payload)
    assert response.status_code == 201, response.text
    materials = (await client.get('/api/v1/materials')).json()['items']
    links = {m['name']: m['groups'][0]['id'] for m in materials}
    assert links['A'] == links['C']
    assert len({links['A'], links['B'], links['D']}) == 3
    preview = await client.post('/api/v1/warehouse/import/preview', json=payload)
    assert preview.json()['new_groups'] == []


@pytest.mark.asyncio
async def test_group_forms_scope_duplicates_to_parent(client: AsyncClient) -> None:
    async def create(name: str, parent: str | None = None):
        return await client.post('/api/v1/inventory-groups', json={
            'name': name, 'parent_id': parent,
        })

    first = (await create('Metal')).json()['id']
    second = (await create('Plastic')).json()['id']
    child = await create('Other', first)
    assert child.status_code == 201
    assert (await create('Other', second)).status_code == 201
    assert (await create('OTHER', first)).status_code == 409
    assert (await create('METAL')).status_code == 409
    moved = await client.put(f"/api/v1/inventory-groups/{child.json()['id']}", json={
        'name': 'Other', 'parent_id': second,
    })
    assert moved.status_code == 409
    renamed = await client.put(f"/api/v1/inventory-groups/{child.json()['id']}", json={
        'name': 'Unique', 'parent_id': second,
    })
    assert renamed.status_code == 200


@pytest.mark.asyncio
async def test_preview_lists_unique_groups_without_creating_them(client: AsyncClient) -> None:
    payload = {
        'version': 1,
        'materials': [{'name': 'Sheet', 'unit': 'pcs', 'group': ['Metal', 'Sheets']}],
        'semi_finished': [{'name': 'Blank', 'unit': 'pcs', 'product': 'Case',
                           'group': ['metal', 'sheets']}],
    }
    response = await client.post('/api/v1/warehouse/import/preview', json=payload)
    assert response.status_code == 200, response.text
    assert response.json()['new_groups'] == [['Metal'], ['Metal', 'Sheets']]
    assert (await client.get('/api/v1/inventory-groups')).json() == []
    assert (await client.get('/api/v1/materials')).json()['items'] == []
    response = await client.post('/api/v1/operations/import/preview', json={
        'version': 1, 'operations': [{'name': 'A', 'group': 'Work'},
                                    {'name': 'B', 'group': 'work'}],
    })
    assert response.json()['new_groups'] == [['Work']]
    assert (await client.get('/api/v1/operation-groups')).json() == []


@pytest.mark.asyncio
async def test_warehouse_import_rolls_back_everything(client: AsyncClient) -> None:
    response = await client.post('/api/v1/warehouse/import', json={
        'version': 1,
        'materials': [{'name': 'Sheet', 'unit': 'pcs', 'group': ['Metal'],
                       'initial_quantity': '10'}],
        'semi_finished': [{'name': 'Blank', 'unit': 'pcs', 'product': 'Missing'}],
    })
    assert response.status_code == 409
    assert (await client.get('/api/v1/materials')).json()['items'] == []
    assert (await client.get('/api/v1/inventory-groups')).json() == []


@pytest.mark.asyncio
async def test_operations_import_and_duplicate_rollback(client: AsyncClient) -> None:
    payload = {'version': 1, 'operations': [
        {'name': 'Assembly', 'group': 'Workshop', 'time_norm': '20',
         'price_per_operation': '350.00'},
    ]}
    assert (await client.post('/api/v1/operations/import', json=payload)).status_code == 201
    response = await client.post('/api/v1/operations/import', json={
        'version': 1, 'operations': [{'name': 'New', 'group': 'New group'}, {'name': 'ASSEMBLY'}],
    })
    assert response.status_code == 409
    operations = (await client.get('/api/v1/operations')).json()['items']
    assert len(operations) == 1
    assert operations[0]['group_id'] is not None
    assert len((await client.get('/api/v1/operation-groups')).json()) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize('payload', [
    {'version': 2, 'operations': [{'name': 'A'}]},
    {'version': 1, 'operations': []},
    {'version': 1, 'operations': [{'name': 'A', 'time_norm': '-1'}]},
    {'version': 1, 'operations': [{'name': 'A', 'typo': 'B'}]},
])
async def test_import_rejects_invalid_format(client: AsyncClient, payload: dict) -> None:
    assert (await client.post('/api/v1/operations/import', json=payload)).status_code == 422
