"""Apply migrations and refuse startup unless this database matches this image."""

import asyncio
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from app.core.config import get_settings
from sqlalchemy import text
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

ROOT = Path(__file__).resolve().parents[1]
LOCK_ID = 7026101401


def current_heads(connection: Connection) -> tuple[str, ...]:
    return MigrationContext.configure(connection).get_current_heads()


def alembic_config() -> Config:
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "migrations"))
    config.set_main_option("prepend_sys_path", str(ROOT))
    return config


async def migrate() -> None:
    config = alembic_config()
    expected = set(ScriptDirectory.from_config(config).get_heads())
    if len(expected) != 1:
        raise RuntimeError(f"Expected one migration head, found {sorted(expected)}")
    url = make_url(get_settings().database_url)
    print(
        f"Migration target: {url.host}:{url.port or 5432}/{url.database}; "
        f"image revision: {os.environ.get('APP_REVISION', 'local')}; "
        f"head: {next(iter(expected))}",
        flush=True,
    )
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.connect() as connection:
            # Separate migration processes, including simultaneous API starts, share this lock.
            await connection.execute(text("SELECT pg_advisory_lock(:lock)"), {"lock": LOCK_ID})
            try:
                before = await connection.run_sync(current_heads)
                print(f"Database before upgrade: {', '.join(before) or 'empty'}", flush=True)
                await asyncio.to_thread(command.upgrade, config, "head")
                actual = set(await connection.run_sync(current_heads))
                if actual != expected:
                    raise RuntimeError(
                        f"Migrations were not applied: database={sorted(actual)}, "
                        f"image={sorted(expected)}"
                    )
                print(f"Database after upgrade: {', '.join(sorted(actual))}; verified", flush=True)
            finally:
                await connection.execute(
                    text("SELECT pg_advisory_unlock(:lock)"), {"lock": LOCK_ID}
                )
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
