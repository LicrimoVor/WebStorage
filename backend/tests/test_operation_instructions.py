import base64
from urllib.parse import urlparse

from httpx import AsyncClient


async def _create_operation(client: AsyncClient) -> str:
    response = await client.post(
        "/api/v1/operations",
        json={"name": "Сверление отверстий", "time_norm": "12.5", "price_per_operation": "50"},
    )
    assert response.status_code == 201
    return str(response.json()["id"])


async def test_instruction_lifecycle_publication_exports_and_revocation(
    client: AsyncClient,
) -> None:
    operation_id = await _create_operation(client)
    instruction_url = f"/api/v1/operations/{operation_id}/instruction"

    absent = await client.get(instruction_url)
    assert absent.status_code == 200
    assert absent.json()["status"] == "absent"

    unsafe_markdown = """# Подготовка

<script>alert('xss')</script>

- Надеть очки
- Использовать **сверло Ø5 мм**

[опасная ссылка](javascript:alert(1))
"""
    draft = await client.put(
        f"{instruction_url}/draft",
        json={"title": "Инструкция по сверлению", "content": unsafe_markdown},
    )
    assert draft.status_code == 200
    assert draft.json()["status"] == "draft"
    assert draft.json()["revision"] == 0
    assert "<script>" not in draft.json()["rendered_html"]
    assert "&lt;script&gt;" in draft.json()["rendered_html"]
    assert 'href="javascript:' not in draft.json()["rendered_html"]

    published = await client.post(f"{instruction_url}/publish")
    assert published.status_code == 200
    assert published.json()["version_number"] == 1
    assert published.json()["status"] == "published"

    link = await client.post(f"{instruction_url}/public-links", json={})
    assert link.status_code == 201
    public_url = link.json()["public_url"]
    token = urlparse(public_url).path.rsplit("/", 1)[-1]
    assert len(token) >= 32

    public = await client.get(f"/api/v1/public/instructions/{token}")
    assert public.status_code == 200
    assert public.json()["version_number"] == 1
    assert "сверло" in public.json()["rendered_html"]

    qr = await client.get(f"/api/v1/public/instructions/{token}/qr.svg")
    assert qr.status_code == 200
    assert qr.headers["content-type"].startswith("image/svg+xml")
    assert b"<svg" in qr.content

    for export_format, signature in {
        "md": b"# ",
        "txt": "Подготовка".encode(),
        "docx": b"PK",
        "pdf": b"%PDF",
    }.items():
        exported = await client.get(f"{instruction_url}/export/{export_format}")
        assert exported.status_code == 200
        assert exported.content.startswith(signature)
        assert "attachment" in exported.headers["content-disposition"]

    next_draft = await client.put(
        f"{instruction_url}/draft",
        json={"title": "Новая инструкция", "content": "# Новая версия\n\nПроверить зажим."},
    )
    assert next_draft.status_code == 200
    assert next_draft.json()["version_number"] == 2
    still_old = await client.get(f"/api/v1/public/instructions/{token}")
    assert still_old.json()["version_number"] == 1

    republished = await client.post(f"{instruction_url}/publish")
    assert republished.json()["version_number"] == 2
    updated_public = await client.get(f"/api/v1/public/instructions/{token}")
    assert updated_public.json()["version_number"] == 2
    history = (await client.get(instruction_url)).json()["versions"]
    assert [item["status"] for item in history] == ["published", "archived"]

    revoked = await client.post(f"{instruction_url}/public-links/{link.json()['id']}/revoke")
    assert revoked.status_code == 200
    assert revoked.json()["active"] is False
    assert (await client.get(f"/api/v1/public/instructions/{token}")).status_code == 404


async def test_instruction_assets_and_optimistic_revision(client: AsyncClient) -> None:
    operation_id = await _create_operation(client)
    instruction_url = f"/api/v1/operations/{operation_id}/instruction"
    first = await client.put(
        f"{instruction_url}/draft",
        json={"title": "Сверление", "content": "Первый вариант"},
    )
    assert first.status_code == 200

    conflict = await client.put(
        f"{instruction_url}/draft",
        json={
            "title": "Сверление",
            "content": "Конфликт",
            "expected_revision": 99,
        },
    )
    assert conflict.status_code == 409

    png = base64.b64encode(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    ).decode()
    uploaded = await client.post(
        f"{instruction_url}/assets",
        json={"filename": "scheme.png", "content_type": "image/png", "content_base64": png},
    )
    assert uploaded.status_code == 201
    assert uploaded.json()["url"].endswith(".png")
    assets = await client.get(f"{instruction_url}/assets")
    assert len(assets.json()) == 1

    deleted = await client.delete(f"{instruction_url}/assets/{uploaded.json()['id']}")
    assert deleted.status_code == 204
    assert (await client.get(f"{instruction_url}/assets")).json() == []
