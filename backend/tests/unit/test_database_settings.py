from app.core.config import Settings
from sqlalchemy.engine import make_url


def test_container_commands_resolve_database_without_entrypoint(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("POSTGRES_DB", "webstorage")
    monkeypatch.setenv("POSTGRES_USER", "webstorage")
    monkeypatch.setenv("POSTGRES_PASSWORD", "test@:%/$password")
    settings = Settings(_env_file=None)
    url = make_url(settings.database_url)
    assert url.host == "database"
    assert url.username == "webstorage"
    assert url.password == "test@:%/$password"
    assert url.database == "webstorage"


def test_explicit_database_url_takes_precedence(monkeypatch):
    explicit = "postgresql+asyncpg://test:test@localhost:5432/test"
    monkeypatch.setenv("DATABASE_URL", explicit)
    monkeypatch.setenv("POSTGRES_DB", "webstorage")
    assert Settings(_env_file=None).database_url == explicit
