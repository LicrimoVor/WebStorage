#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Run as root through SSH/sudo. Application secrets live only on the server.
[[ $EUID == 0 ]] || { echo 'Run deploy with sudo.' >&2; exit 1; }
bundle=$(realpath "${1:?Bundle directory is required}")
release_id=${2:?Release ID is required}
[[ $release_id =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || exit 1
[[ $bundle == /tmp/webstorage.* && -d $bundle ]] || exit 1

base=/opt/webstorage
web_root=/var/www/html
site=/etc/nginx/sites-available/webstorage
enabled=/etc/nginx/sites-enabled/webstorage
release="$base/releases/$release_id"
for command in docker nginx rsync python3 curl flock gzip; do
    command -v "$command" >/dev/null
done
[[ -f $base/.env && -f $bundle/frontend/index.html && -f $bundle/backend-image.tar.gz ]]
install -d -m 700 "$base" "$base/releases" "$base/backups"
exec 9>"$base/deploy.lock"
flock -w 600 9
chmod 600 "$base/.env"
previous=$(readlink -f "$base/current" || true)
if [[ -n $previous && -e $previous ]]; then
    [[ $previous == "$base/releases/"* && -f $previous/image ]]
else
    previous=''
fi
if [[ -e $enabled || -L $enabled ]]; then
    [[ -L $enabled && $(readlink "$enabled") == "$site" ]] || {
        echo "$enabled is not a managed site symlink" >&2; exit 1;
    }
fi
mkdir "$release"
install -m 600 "$bundle/deploy/compose.yml" "$release/compose.yml"
rsync -rlt "$bundle/frontend/" "$release/frontend/"
export BACKEND_IMAGE="webstorage-backend:${release_id%%-*}"
printf '%s\n' "$BACKEND_IMAGE" > "$release/image"
compose() {
    docker compose --project-name webstorage-production --env-file "$base/.env" \
        --file "$release/compose.yml" "$@"
}
compose config --quiet
domain=$(compose config --format json | python3 -c '
import json, re, sys
from urllib.parse import urlsplit
origin = json.load(sys.stdin)["services"]["backend"]["environment"]["PUBLIC_APP_URL"]
url = urlsplit(origin)
assert url.scheme == "https" and re.fullmatch(r"[a-zA-Z0-9.-]+", url.netloc)
assert "." in url.netloc and not url.path and not url.query and not url.fragment
print(url.netloc)
')
[[ -r /etc/letsencrypt/live/$domain/fullchain.pem && -r /etc/letsencrypt/live/$domain/privkey.pem ]] || {
    echo "Obtain the HTTPS certificate for $domain before deployment." >&2; exit 1;
}
sed "s/s278424.hostiman.com/$domain/g" "$bundle/deploy/nginx.conf.template" > "$release/nginx.conf"
[[ ! -f $site ]] || cp "$site" "$release/previous-nginx.conf"
[[ ! -f $web_root/index.html ]] || cp "$web_root/index.html" "$release/previous-index.html"
site_was_enabled=false
[[ ! -L $enabled ]] || site_was_enabled=true
nginx_changed=false
frontend_changed=false
backend_changed=false

rollback() {
    result=$?
    trap - EXIT
    if (( result == 0 )); then return; fi
    set +e
    echo 'Deployment failed. Restoring the previous application where possible.' >&2
    if $frontend_changed; then
        if [[ -f $release/previous-index.html ]]; then
            install -m 644 "$release/previous-index.html" "$web_root/index.html"
        else
            rm -f "$web_root/index.html"
        fi
    fi
    if $nginx_changed; then
        if [[ -f $release/previous-nginx.conf ]]; then
            install -m 644 "$release/previous-nginx.conf" "$site"
        else
            rm -f "$site"
        fi
        if ! $site_was_enabled; then rm -f "$enabled"; fi
        nginx -t && systemctl reload-or-restart nginx
    fi
    if $backend_changed; then
        if [[ -n $previous ]]; then
            export BACKEND_IMAGE
            BACKEND_IMAGE=$(cat "$previous/image")
            docker compose --project-name webstorage-production --env-file "$base/.env" \
                --file "$previous/compose.yml" up -d --no-deps --wait --wait-timeout 120 backend \
                || echo 'Previous backend could not start; manual recovery required.' >&2
        else
            compose stop backend
        fi
    fi
    echo "Database migrations are NOT reversed. Backup: $base/backups/$release_id.dump" >&2
    exit "$result"
}
trap rollback EXIT

gzip -dc "$bundle/backend-image.tar.gz" | docker load
docker image inspect "$BACKEND_IMAGE" >/dev/null
compose up -d --wait --wait-timeout 120 database
backend_changed=true
compose stop backend
# Expand these variables inside the database container, not on the host.
# shellcheck disable=SC2016
compose exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
    > "$base/backups/$release_id.dump"
compose run --rm --no-deps backend alembic upgrade head
compose up -d --no-deps --wait --wait-timeout 120 backend

install -d -m 755 "$web_root" /etc/nginx/sites-available /etc/nginx/sites-enabled
# Keep hashed assets from earlier releases for open browser tabs and rollback.
rsync -rlt --chmod=D755,F644 --exclude=index.html "$release/frontend/" "$web_root/"
frontend_changed=true
install -m 644 "$release/frontend/index.html" "$web_root/.webstorage-index-$release_id"
mv -f "$web_root/.webstorage-index-$release_id" "$web_root/index.html"
nginx_changed=true
install -m 644 "$release/nginx.conf" "$site"
ln -sfn "$site" "$enabled"
nginx -t
systemctl reload-or-restart nginx
curl --fail --silent --show-error --resolve "$domain:443:127.0.0.1" "https://$domain/health/live"
curl --fail --silent --show-error --resolve "$domain:443:127.0.0.1" "https://$domain/" \
    | cmp - "$release/frontend/index.html"
status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --resolve "$domain:443:127.0.0.1" "https://$domain/api/v1/auth/session")
[[ $status == 401 ]]
ln -sfnT "$release" "$base/current-next"
mv -Tf "$base/current-next" "$base/current"
printf '\nDeployed %s to https://%s\n' "$release_id" "$domain"
