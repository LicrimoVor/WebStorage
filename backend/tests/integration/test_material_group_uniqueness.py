import asyncio

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_material_name_and_group_create_update_archive(client: AsyncClient) -> None:
    groups = []
    for name in ['A', 'B']:
        response = await client.post('/api/v1/inventory-groups', json={'name': name})
        groups.append(response.json()['id'])

    async def create(name: str, group_ids: list[str]):
        return await client.post('/api/v1/materials', json={
            'name': name, 'unit': 'pcs', 'group_ids': group_ids,
        })

    first = await create('Bolt', [groups[0]])
    second = await create('Bolt', [groups[1]])
    ungrouped = await create('Bolt', [])
    assert [first.status_code, second.status_code, ungrouped.status_code] == [201, 201, 201]
    assert (await create('BOLT', [groups[0]])).status_code == 409
    assert (await create('bolt', [])).status_code == 409
    assert (await create('Bolt', groups)).status_code == 409
    first_id = first.json()['id']
    assert (await client.patch(f'/api/v1/materials/{first_id}', json={
        'group_ids': [groups[1]],
    })).status_code == 409
    assert (await client.patch(f'/api/v1/materials/{first_id}', json={
        'group_ids': [],
    })).status_code == 409
    renamed = await client.patch(f'/api/v1/materials/{first_id}', json={
        'name': 'Screw', 'group_ids': [groups[1]],
    })
    assert renamed.status_code == 200, renamed.text
    assert (await client.patch(f'/api/v1/materials/{first_id}', json={
        'name': 'Bolt',
    })).status_code == 409
    assert (await client.post(f'/api/v1/materials/{first_id}/archive')).status_code == 200
    assert (await create('Screw', [groups[1]])).status_code == 409
    # Removing the group would create two ungrouped Bolts, so deletion rolls back.
    assert (await client.delete(f'/api/v1/inventory-groups/{groups[1]}')).status_code == 409
    assert any(g['id'] == groups[1] for g in (await client.get('/api/v1/inventory-groups')).json())


@pytest.mark.asyncio
async def test_import_same_material_name_in_distinct_subgroups(client: AsyncClient) -> None:
    payload = {'version': 1, 'materials': [
        {'name': 'Bolt', 'unit': 'pcs', 'group': ['Metal', 'Other']},
        {'name': 'Bolt', 'unit': 'pcs', 'group': ['Plastic', 'Other']},
        {'name': 'Bolt', 'unit': 'pcs', 'group': ['Metal']},
    ]}
    response = await client.post('/api/v1/warehouse/import', json=payload)
    assert response.status_code == 201, response.text
    assert response.json()['created'] == 3
    response = await client.post('/api/v1/warehouse/import', json={
        'version': 1, 'materials': [
            {'name': 'New', 'unit': 'pcs', 'group': ['New']},
            {'name': 'BOLT', 'unit': 'pcs', 'group': ['metal', 'other']},
        ],
    })
    assert response.status_code == 409
    assert 'BOLT' in response.json()['detail']
    assert len((await client.get('/api/v1/materials')).json()['items']) == 3
    groups = (await client.get('/api/v1/inventory-groups')).json()
    assert not any(g['name'] == 'New' for g in groups)


@pytest.mark.asyncio
async def test_concurrent_material_creation_prevents_duplicates(client: AsyncClient) -> None:
    responses = await asyncio.gather(*(
        client.post('/api/v1/materials', json={'name': 'Bolt', 'unit': 'pcs'})
        for _ in range(2)
    ))
    assert sorted(response.status_code for response in responses) == [201, 409]
