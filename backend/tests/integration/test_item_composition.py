from decimal import Decimal

import pytest
from httpx import AsyncClient
from tests.integration.helpers import embedded_process
from tests.integration.test_production_execution import create_item, create_material


@pytest.mark.asyncio
async def test_composition_shows_recipe_per_unit_even_when_stock_is_available(
    client: AsyncClient,
) -> None:
    product = await create_item(client, name="Product", is_product=True)
    semi = await create_item(client, name="Semi", is_product=False, stock="100")
    material = await create_material(client, name="Plate", stock="200")
    operation = (await client.post('/api/v1/operations', json={'name': 'Cut'})).json()
    process = await embedded_process(client, product, semi, [
        ('material', material['id'], '2.5'), ('operation', operation['id'], '3'),
    ], '4')
    response = await client.get(f"/api/v1/manufactured-items/{semi['id']}/composition")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['has_recipe'] is True
    assert data['process_id'] == process['process_id']
    assert data['version_number'] == 1
    quantities = {entry['kind']: Decimal(entry['quantity']) for entry in data['entries']}
    assert quantities == {'material': Decimal('2.5'), 'operation': Decimal('3')}
    product_data = (await client.get(
        f"/api/v1/manufactured-items/{product['id']}/composition"
    )).json()
    assert len(product_data['entries']) == 1
    assert product_data['entries'][0]['id'] == semi['id']
    assert Decimal(product_data['entries'][0]['quantity']) == 4


@pytest.mark.asyncio
async def test_composition_without_recipe_and_with_draft_process(client: AsyncClient) -> None:
    product = await create_item(client, name="Product", is_product=True)
    semi = await create_item(client, name="Semi", is_product=False)
    url = f"/api/v1/manufactured-items/{semi['id']}/composition"
    data = (await client.get(url)).json()
    assert data == {'process_id': None, 'version_number': None, 'has_recipe': False, 'entries': []}
    process = (await client.post('/api/v1/technological-processes', json={
        'name': 'Draft', 'output_item_id': product['id'],
    })).json()
    data = (await client.get(url)).json()
    assert data['has_recipe'] is False
    assert data['process_id'] == process['process']['id']
