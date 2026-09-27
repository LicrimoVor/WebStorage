import getpass
import warnings

import pytest
from app import cli


@pytest.mark.parametrize("command", ["reset-password", "set-password"])
def test_password_reset_command(command: str) -> None:
    args = cli._parser().parse_args([command, "admin"])
    assert args.username == "admin"
    assert args.command == command


@pytest.mark.parametrize(
    ("password", "confirmation", "message"),
    [
        ("a long password", "different password", "do not match"),
        ("short", "short", "at least 12"),
        ("x" * 129, "x" * 129, "no more than 128"),
        (" " * 12, " " * 12, "whitespace"),
    ],
)
def test_invalid_password_is_rejected(
    monkeypatch: pytest.MonkeyPatch, password: str, confirmation: str, message: str
) -> None:
    values = iter([password, confirmation])
    monkeypatch.setattr(getpass, "getpass", lambda _prompt: next(values))
    with pytest.raises(ValueError, match=message):
        cli._read_password()


def test_refuses_password_input_without_hidden_terminal(monkeypatch: pytest.MonkeyPatch) -> None:
    def unsafe_input(_prompt: str) -> str:
        warnings.warn("Password input may be echoed", getpass.GetPassWarning, stacklevel=2)
        pytest.fail("Must not read a password with echo enabled")

    monkeypatch.setattr(getpass, "getpass", unsafe_input)
    with pytest.raises(ValueError, match="interactive terminal"):
        cli._read_password()
