import os
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://webstorage:webstorage@localhost:5433/webstorage_test",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["AUTH_DISABLED"] = "true"

from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    environment = os.environ.copy()
    environment["DATABASE_URL"] = TEST_DATABASE_URL
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend_dir,
        env=environment,
        check=True,
    )


@pytest_asyncio.fixture
async def database_engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "TRUNCATE TABLE manufactured_item_movements, manufactured_items, "
                "inventory_movements, materials CASCADE"
            )
        )
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def client(database_engine: AsyncEngine) -> AsyncIterator[AsyncClient]:
    del database_engine
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http_client:
        yield http_client
