"""Use the same safely encoded database URL for migrations and the API."""

import os
import sys

from sqlalchemy import URL

if not os.environ.get("DATABASE_URL"):
    os.environ["DATABASE_URL"] = URL.create(
        "postgresql+asyncpg",
        username=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        host="database",
        port=5432,
        database=os.environ["POSTGRES_DB"],
    ).render_as_string(hide_password=False)

os.execvp(sys.argv[1], sys.argv[1:])
