from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()

# A real Argon2id hash used whenever a username does not exist. Verifying it keeps
# the observable login cost close to the valid-user path and hinders enumeration.
DUMMY_PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$"
    "U97N3WwCjWu8xodfTDjo8A$kY92dq9MPz8N2qf7L3mIwHtXiJyg40Oy+6wZbgynk2k"
)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded: str) -> tuple[bool, str | None]:
    return password_hash.verify_and_update(password, encoded)
