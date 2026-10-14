"""Execute the SSH heredocs with a Docker stub that can consume their stdin."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

WORKFLOW = Path(__file__).resolve().parents[3] / ".github/workflows/cd.yml"
STEPS = [
    "Build backend and back up database",
    "Apply database migrations",
    "Start backend and verify health",
]
DOCKER_STUB = r'''
install() { :; }
docker() {
  printf '%s\n' "$*" >> "$CD_TEST_LOG"
  case "$*" in
    *" exec "*|*" run "*)
      # Compose attaches stdin even when exec has -T, unless explicitly disabled.
      case "$*" in *"--interactive=false"*) ;; *) cat > /dev/null ;; esac
      ;;
  esac
  case "$CD_FAIL_STAGE:$*" in
    backup:*" exec "*|migration:*"scripts.migrate"*|startup:*"--force-recreate"*)
      return 42
      ;;
  esac
  case "$*" in *" exec "*) printf 'fake database dump\n' ;; esac
  return 0
}
'''


def bash_path() -> str:
    if os.name == "nt":
        git_bash = Path("C:/Program Files/Git/bin/bash.exe")
        if git_bash.is_file():
            return str(git_bash)
    elif bash := shutil.which("bash"):
        return bash
    pytest.skip("Bash is required to exercise the CD remote scripts")


def shell_path(path: Path) -> str:
    value = path.as_posix()
    if os.name == "nt":
        return f"/{value[0].lower()}{value[2:]}"
    return value


def remote_scripts(tmp_path: Path) -> list[str]:
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    steps = {step["name"]: step for step in workflow["jobs"]["deploy"]["steps"]}
    scripts = []
    for name in STEPS:
        remote = steps[name]["run"].split("<<'REMOTE'\n", 1)[1].rsplit("\nREMOTE", 1)[0]
        scripts.append(remote.replace("/opt/webstorage", shell_path(tmp_path)))
    (tmp_path / "repository").mkdir()
    (tmp_path / "backups").mkdir()
    return scripts


def execute(script: str, tmp_path: Path, fail_stage: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [bash_path(), "-se", "--", "test-revision"],
        input=DOCKER_STUB + script + "\n",
        env={
            **os.environ,
            "CD_TEST_LOG": shell_path(tmp_path / "docker.log"),
            "CD_FAIL_STAGE": fail_stage,
        },
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=20,
    )


def test_cd_backup_migrations_and_startup_reach_end_of_ssh_input(tmp_path: Path) -> None:
    scripts = remote_scripts(tmp_path)
    for script in scripts:
        result = execute(script + '\nprintf "REMOTE_COMPLETED\\n"', tmp_path)
        assert result.returncode == 0, result.stderr
        assert "REMOTE_COMPLETED" in result.stdout
    commands = (tmp_path / "docker.log").read_text().splitlines()
    backup = next(i for i, command in enumerate(commands) if " exec " in command)
    stop = next(i for i, command in enumerate(commands) if command.endswith("stop backend"))
    migration = next(i for i, command in enumerate(commands) if "scripts.migrate" in command)
    check = next(i for i, command in enumerate(commands) if "alembic check" in command)
    startup = next(i for i, command in enumerate(commands) if "--force-recreate" in command)
    assert backup < stop < migration < check < startup
    assert list((tmp_path / "backups").glob("*.dump"))


@pytest.mark.parametrize("stage", ["backup", "migration", "startup"])
def test_cd_failure_is_reported_and_does_not_execute_later_steps(
    tmp_path: Path, stage: str
) -> None:
    for script in remote_scripts(tmp_path):
        result = execute(script, tmp_path, fail_stage=stage)
        if result.returncode:
            break
    assert result.returncode == 42
    commands = (tmp_path / "docker.log").read_text()
    if stage == "backup":
        assert "stop backend" not in commands
        assert "scripts.migrate" not in commands
    elif stage == "migration":
        assert "migration step failed" in result.stderr
        assert "alembic check" not in commands
        assert "--force-recreate" not in commands
    else:
        assert "Backend startup failed" in result.stderr
        assert "logs --no-color --tail 100 backend" in commands


def test_attached_compose_stdin_reproduces_silent_success(tmp_path: Path) -> None:
    backup = remote_scripts(tmp_path)[0]
    backup = backup.replace("--interactive=false ", "").replace(" < /dev/null", "")
    result = execute(backup + '\nprintf "REMOTE_COMPLETED\\n"', tmp_path)
    assert result.returncode == 0
    assert "REMOTE_COMPLETED" not in result.stdout
    assert not list((tmp_path / "backups").glob("*.dump"))
