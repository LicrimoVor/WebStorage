from app.main import app
from httpx import ASGITransport, AsyncClient


async def test_noindex_applies_to_successful_and_missing_resources() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for path, status in [("/health/live", 200), ("/api/v1/missing-endpoint", 404)]:
            response = await client.get(path)
            assert response.status_code == status
            assert "noindex" in response.headers["x-robots-tag"]
            assert response.headers["x-content-type-options"] == "nosniff"
            if path.startswith("/api/"):
                assert response.headers["cache-control"] == "no-store"
