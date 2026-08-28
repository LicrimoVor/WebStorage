import base64
from pathlib import Path
from urllib.parse import urlparse

import pytest
from app.core.config import get_settings
from httpx import AsyncClient

PNG_PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


@pytest.mark.asyncio
async def test_upload_and_serve_image(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/media/images",
        json={
            "filename": "preview.png",
            "content_type": "image/png",
            "content_base64": base64.b64encode(PNG_PIXEL).decode("ascii"),
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["content_type"] == "image/png"
    assert body["size"] == len(PNG_PIXEL)
    image_path = urlparse(body["url"]).path
    served = await client.get(image_path)
    assert served.status_code == 200
    assert served.content == PNG_PIXEL

    filename = Path(image_path).name
    (get_settings().media_root / filename).unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_rejects_mismatched_or_unsupported_image(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/media/images",
        json={
            "filename": "fake.jpg",
            "content_type": "image/jpeg",
            "content_base64": base64.b64encode(PNG_PIXEL).decode("ascii"),
        },
    )
    assert response.status_code == 422

    text_file = await client.post(
        "/api/v1/media/images",
        json={
            "filename": "notes.txt",
            "content_type": "text/plain",
            "content_base64": base64.b64encode(b"not an image").decode("ascii"),
        },
    )
    assert text_file.status_code == 422
