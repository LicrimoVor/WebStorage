#!/usr/bin/env bash
set -Eeuo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
export BACKEND_IMAGE=${BACKEND_IMAGE:-webstorage-backend:check}
# Exercise URL encoding, including Alembic's percent interpolation.
export POSTGRES_PASSWORD='cd-check@%:password'
compose() {
    docker compose --project-name webstorage-cd-check \
        --env-file "$root/deploy/production.env.example" \
        --file "$root/deploy/compose.yml" --file "$root/deploy/compose.check.yml" "$@"
}
# Only this isolated test project's volumes are removed.
trap 'compose down --volumes --remove-orphans' EXIT
compose up -d --wait --wait-timeout 120 database
compose run --rm --no-deps backend alembic upgrade head
compose run --rm --no-deps backend alembic check
compose up -d --wait --wait-timeout 120 backend
compose exec -T backend python -c '
import os
import urllib.error
import urllib.request
from pathlib import Path
assert os.getuid() != 0
path = Path("/app/media/.deployment-check")
path.write_text("ok")
path.unlink()
try:
    urllib.request.urlopen("http://127.0.0.1:8000/api/v1/auth/session", timeout=5)
except urllib.error.HTTPError as error:
    assert error.code == 401
else:
    raise AssertionError("Authentication must be enabled")
'
