from httpx import AsyncClient


async def funding_source(client: AsyncClient) -> str:
    sources = (await client.get("/api/v1/funding-sources")).json()
    if sources:
        return str(sources[0]["id"])
    response = await client.post("/api/v1/funding-sources", json={"name": "Test account"})
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def owner_product(client: AsyncClient) -> str:
    response = await client.get("/api/v1/manufactured-items?kind=product")
    products = response.json()["items"]
    if products:
        return str(products[0]["id"])
    response = await client.post(
        "/api/v1/manufactured-items",
        json={"name": "Owner product", "is_product": True, "unit": "pcs", "initial_quantity": "1"},
    )
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def embedded_process(
    client: AsyncClient,
    product: dict,
    semi: dict,
    inputs: list[tuple[str, str, str]],
    quantity: str,
    product_operations: list[tuple[str, str, str]] | None = None,
) -> dict:
    nodes = [
        {"id": "semi", "type": "manufactured_item", "referenceId": semi["id"]},
        {"id": "output", "type": "output", "referenceId": product["id"]},
    ]
    edges = []
    for index, (kind, reference, amount) in enumerate(inputs):
        nodes.append({"id": f"in-{index}", "type": kind, "referenceId": reference})
        edges.append(
            {"id": f"e-{index}", "source": f"in-{index}", "target": "semi", "quantity": amount}
        )
    edges.append({"id": "semi-output", "source": "semi", "target": "output", "quantity": quantity})
    for index, (kind, reference, amount) in enumerate(product_operations or []):
        nodes.append({"id": f"op-{index}", "type": kind, "referenceId": reference})
        edges.append(
            {
                "id": f"op-edge-{index}",
                "source": f"op-{index}",
                "target": "output",
                "quantity": amount,
            }
        )
    result = await client.post(
        "/api/v1/technological-processes/import",
        json={
            "name": product["name"] + " process",
            "outputItemId": product["id"],
            "nodes": nodes,
            "edges": edges,
        },
    )
    assert result.status_code == 201, result.text
    data = result.json()
    activated = await client.post(
        f"/api/v1/technological-processes/{data['process']['id']}/versions/{data['version']['id']}/activate"
    )
    assert activated.status_code == 200, activated.text
    return {"process_id": data["process"]["id"], "version": activated.json()}
