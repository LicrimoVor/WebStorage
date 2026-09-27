import argparse
import asyncio
import getpass
import re
import sys
import warnings

from app.core.audit_context import AuditContext, audit_context
from app.core.database import async_session_factory
from app.core.errors import ApplicationError
from app.core.security import Role
from app.modules.auth import service

USERNAME_PATTERN = re.compile(r"^[\w.@+-]{3,100}$", re.UNICODE)


def _valid_username(value: str) -> str:
    cleaned = value.strip()
    if not USERNAME_PATTERN.fullmatch(cleaned):
        raise argparse.ArgumentTypeError(
            "username must be 3-100 characters and contain only letters, digits, _, ., @, + or -"
        )
    return cleaned


def _read_password() -> str:
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            password = getpass.getpass("New password: ")
            confirmation = getpass.getpass("Repeat new password: ")
        except getpass.GetPassWarning as error:
            raise ValueError(
                "An interactive terminal is required for hidden password input"
            ) from error
    if password != confirmation:
        raise ValueError("Passwords do not match")
    if len(password) < 12:
        raise ValueError("Password must contain at least 12 characters")
    if len(password) > 128:
        raise ValueError("Password must contain no more than 128 characters")
    if not password.strip():
        raise ValueError("Password must not contain only whitespace")
    return password


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="webstorage",
        description="Manage WebStorage users. Passwords are always entered interactively.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-user", help="create a user and password")
    create.add_argument("username", type=_valid_username)
    create.add_argument(
        "--role",
        action="append",
        choices=[role.value for role in Role],
        help="role to grant; may be repeated (defaults to admin)",
    )
    reset = commands.add_parser(
        "reset-password",
        aliases=["set-password"],
        help="recover access by setting a new password without the old one",
        description=(
            "Set a new password, clear the temporary login lock and revoke all sessions. "
            "The old password is not required. Disabled accounts remain disabled."
        ),
    )
    reset.add_argument("username", type=_valid_username)
    disable = commands.add_parser("disable-user", help="disable a user and revoke sessions")
    disable.add_argument("username", type=_valid_username)
    enable = commands.add_parser("enable-user", help="enable a user")
    enable.add_argument("username", type=_valid_username)
    commands.add_parser("list-users", help="list users without password hashes")
    return parser


async def _run(args: argparse.Namespace) -> None:
    token = audit_context.set(AuditContext(actor=f"cli:{getpass.getuser()}"))
    try:
        await _run_command(args)
    finally:
        audit_context.reset(token)


async def _run_command(args: argparse.Namespace) -> None:
    async with async_session_factory() as session:
        if args.command == "create-user":
            roles = [Role(value) for value in (args.role or [Role.ADMIN.value])]
            user = await service.create_user(
                session,
                username=args.username,
                password=_read_password(),
                roles=roles,
            )
            print(f"Created user {user.username} ({', '.join(user.roles)})")
        elif args.command in {"reset-password", "set-password"}:
            await service.set_user_password(
                session, username=args.username, password=_read_password()
            )
            print(f"Password replaced and sessions revoked for {args.username}")
        elif args.command == "disable-user":
            await service.set_user_active(session, username=args.username, active=False)
            print(f"Disabled user {args.username} and revoked active sessions")
        elif args.command == "enable-user":
            await service.set_user_active(session, username=args.username, active=True)
            print(f"Enabled user {args.username}")
        else:
            users = await service.list_users(session)
            for user in users:
                state = "active" if user.active else "disabled"
                print(f"{user.username}\t{state}\t{','.join(user.roles)}")


def main() -> None:
    try:
        asyncio.run(_run(_parser().parse_args()))
    except (EOFError, KeyboardInterrupt):
        print("Cancelled.", file=sys.stderr)
        raise SystemExit(130) from None
    except (ApplicationError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
