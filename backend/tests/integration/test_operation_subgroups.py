from httpx import AsyncClient


async def test_operation_subgroups_filter_and_uniqueness(client: AsyncClient) -> None:
    async def group(name: str, parent: str | None = None):
        return await client.post('/api/v1/operation-groups', json={
            'name': name, 'parent_id': parent,
        })

    first = (await group('A')).json()['id']
    second = (await group('B')).json()['id']
    child = (await group('Other', first)).json()['id']
    assert (await group('Other', second)).status_code == 201
    assert (await group('OTHER', first)).status_code == 409
    assert (await group('Third', child)).status_code == 422
    assert (await client.patch(f'/api/v1/operation-groups/{first}', json={
        'name': 'A', 'parent_id': second,
    })).status_code == 422
    assert (await client.delete(f'/api/v1/operation-groups/{first}')).status_code == 409
    await client.post('/api/v1/operations', json={'name': 'Work', 'group_id': child})
    await client.post('/api/v1/operations', json={'name': 'Root work', 'group_id': first})
    assert (await client.get(f'/api/v1/operations?group_id={first}')).json()['total'] == 2
    assert (await client.get(f'/api/v1/operations?group_id={child}')).json()['total'] == 1


async def test_operation_import_paths_and_preview(client: AsyncClient) -> None:
    payload = {'version': 1, 'operations': [
        {'name': 'Cut', 'group': ['A', 'Other']},
        {'name': 'Drill', 'group': ['B', 'Other']},
        {'name': 'Polish', 'group': ['a', 'OTHER']},
    ]}
    preview = await client.post('/api/v1/operations/import/preview', json=payload)
    assert preview.json()['new_groups'] == [['A'], ['A', 'Other'], ['B'], ['B', 'Other']]
    assert (await client.get('/api/v1/operation-groups')).json() == []
    imported = await client.post('/api/v1/operations/import', json=payload)
    assert imported.status_code == 201, imported.text
    rows = (await client.get('/api/v1/operations')).json()['items']
    groups = {row['name']: row['group_id'] for row in rows}
    assert groups['Cut'] == groups['Polish']
    assert groups['Cut'] != groups['Drill']
    assert (await client.post('/api/v1/operations/import/preview', json=payload)).json()[
        'new_groups'
    ] == []
