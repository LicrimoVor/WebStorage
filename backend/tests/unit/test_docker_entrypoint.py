import os
import runpy
import subprocess
import sys
from pathlib import Path

import pytest

ENTRYPOINT = Path(__file__).resolve().parents[2] / "docker-entrypoint.py"


class ExecRequested(Exception):
    pass


@pytest.mark.parametrize("command", ["uvicorn", "alembic", "python"])
def test_migrations_run_before_api_and_other_commands_are_not_intercepted(
    monkeypatch: pytest.MonkeyPatch, command: str
) -> None:
    events: list[str] = []
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://test:test@database/test")
    monkeypatch.delenv("AUTO_MIGRATE", raising=False)
    monkeypatch.setattr(sys, "argv", [str(ENTRYPOINT), command, "argument"])

    def migrate(args: list[str], *, check: bool) -> None:
        assert args == [sys.executable, "-m", "scripts.migrate"]
        assert check is True
        events.append("migration")

    def execute(program: str, args: list[str]) -> None:
        assert program == command and args == [command, "argument"]
        events.append("exec")
        raise ExecRequested

    monkeypatch.setattr(subprocess, "run", migrate)
    monkeypatch.setattr(os, "execvp", execute)
    with pytest.raises(ExecRequested):
        runpy.run_path(str(ENTRYPOINT), run_name="__main__")
    assert events == (["migration", "exec"] if command == "uvicorn" else ["exec"])


def test_failed_migration_never_starts_api(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://test:test@database/test")
    monkeypatch.delenv("AUTO_MIGRATE", raising=False)
    monkeypatch.setattr(sys, "argv", [str(ENTRYPOINT), "uvicorn", "app.main:app"])

    def fail(*args: object, **kwargs: object) -> None:
        raise subprocess.CalledProcessError(1, "migration")

    def unexpected_exec(*args: object) -> None:
        pytest.fail("API started after a migration error")

    monkeypatch.setattr(subprocess, "run", fail)
    monkeypatch.setattr(os, "execvp", unexpected_exec)
    with pytest.raises(subprocess.CalledProcessError):
        runpy.run_path(str(ENTRYPOINT), run_name="__main__")
