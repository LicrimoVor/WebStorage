import argparse
import asyncio
import getpass
import re
import sys

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
    password = getpass.getpass("Password: ")
    confirmation = getpass.getpass("Repeat password: ")
    if password != confirmation:
        raise ValueError("Passwords do not match")
    if len(password) < 12:
        raise ValueError("Password must contain at least 12 characters")
    if len(password) > 128:
        raise ValueError("Password must contain no more than 128 characters")
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
    reset = commands.add_parser("set-password", help="replace a user's password")
    reset.add_argument("username", type=_valid_username)
    disable = commands.add_parser("disable-user", help="disable a user and revoke sessions")
    disable.add_argument("username", type=_valid_username)
    enable = commands.add_parser("enable-user", help="enable a user")
    enable.add_argument("username", type=_valid_username)
    commands.add_parser("list-users", help="list users without password hashes")
    return parser


async def _run(args: argparse.Namespace) -> None:
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
        elif args.command == "set-password":
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
    except (ApplicationError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
