# CD: Docker Compose, nginx и статический frontend

## Что выполняется автоматически

После push в `main` workflow `CI` запускает тесты backend/frontend и проверку
конфигурации деплоя. Только после их успешного завершения вызывается `CD`.
Повторный запуск доступен через **Actions → CI → Run workflow**, ветка `main`.
Pull request не запускает деплой.

CD собирает Linux amd64 образ backend и frontend с `VITE_API_URL=/api/v1`,
передаёт архив по SSH и проверяет его SHA-256. Docker Registry не требуется.
На сервере скрипт:

1. Загружает образ и запускает PostgreSQL через `deploy/compose.yml`.
2. Останавливает backend на время обновления и создаёт `pg_dump` БД.
3. Применяет `alembic upgrade head` отдельным контейнером.
4. Запускает backend и ждёт успешной healthcheck.
5. Копирует статику в `/var/www/html/`, заменяя `index.html` атомарно.
6. Проверяет и перезагружает nginx; проверяет HTTPS, API и отдачу нового HTML.

Деплои выполняются последовательно; обновление предполагает короткий перерыв
в доступности API. Данные БД и фотографии сохраняются в Docker volumes.
PostgreSQL не публикует порт, API слушает только `127.0.0.1:8000` хоста.
nginx работает на хосте, обслуживает SPA и проксирует `/api/`, `/media/`.

## Один раз подготовить сервер

Расчёт на отдельный сервер Ubuntu/Debian **amd64** с systemd, Docker Engine
и Docker Compose v2.24+ (либо v5). `/var/www/html/` предназначен этому приложению.
Не используйте этот каталог для другого сайта. DNS домена должен указывать
на сервер; порты 80/443 и SSH должны быть доступны.

Установить nginx и утилиты (Docker Engine и Compose должны быть установлены):

```bash
sudo apt-get update
sudo apt-get install -y nginx rsync python3 curl certbot openssl
docker compose version
sudo install -d -m 700 /opt/webstorage
```

Скопировать содержимое `deploy/production.env.example` в `/opt/webstorage/.env`:

```bash
sudoedit /opt/webstorage/.env
sudo chmod 600 /opt/webstorage/.env
```

Задать `PUBLIC_APP_URL=https://ваш-домен` **без завершающего слеша**, а также
`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`. Пароль сгенерировать один раз
через `openssl rand -hex 32`. Не менять пароль существующей БД простым изменением
`.env`: PostgreSQL применяет переменные инициализации только к пустому volume.
Секреты БД остаются на сервере и не входят в архив/образ. `DATABASE_URL`
контейнер собирает самостоятельно, корректно кодируя специальные символы.

Получить сертификат для домена. На свежем сервере можно использовать standalone:

```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone --cert-name storage.example.com \
  -d storage.example.com --email admin@example.com --agree-tos --no-eff-email
sudo systemctl start nginx
```

Заменить домен и email своими. Скрипт ожидает сертификат и ключ в
`/etc/letsencrypt/live/ДОМЕН/`. После первого деплоя перевести обновление
сертификата на webroot, чтобы оно не требовало остановки nginx:

Команда `reconfigure` требует Certbot 2.3+; для старых версий порядок изменения
параметров приведён в [официальной инструкции Certbot](https://eff-certbot.readthedocs.io/en/stable/using.html#modifying-the-renewal-configuration-of-existing-certificates).

```bash
sudo certbot reconfigure --cert-name storage.example.com \
  --webroot --webroot-path /var/www/html
sudo install -d /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' | \
  sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

Для CD нужен SSH-пользователь с ключом и правом `sudo -n bash` без пароля.
Это административный доступ: используйте отдельную учётную запись деплоя.
Пример записи в `sudo visudo -f /etc/sudoers.d/webstorage-deploy`:

```text
deploy ALL=(root) NOPASSWD: /usr/bin/bash
```

Публичную часть SSH-ключа добавить этому пользователю в `~/.ssh/authorized_keys`.
Проверить вход с ключом и `sudo -n /usr/bin/bash -c 'id -u'`: результат `0`.

## GitHub Environment

Создать Environment **production** в Settings → Environments и добавить Secrets:

| Secret | Значение |
| --- | --- |
| `DEPLOY_HOST` | IPv4 или DNS SSH-сервера |
| `DEPLOY_USER` | SSH-пользователь, например `deploy` |
| `DEPLOY_SSH_KEY` | Приватный SSH-ключ целиком, без passphrase |
| `DEPLOY_KNOWN_HOSTS` | Проверенная строка ключа SSH-хоста в формате known_hosts |

При нестандартном SSH-порте добавить Environment Variable `DEPLOY_PORT`.
По умолчанию используется `22`. Для нестандартного порта запись known_hosts
должна иметь вид `[host]:port`. Полученный `ssh-keyscan -p PORT HOST` ключ
сверить с отпечатком через консоль сервера перед сохранением; CD не отключает
проверку ключа хоста. Добавьте ограничения Environment на ветку `main`.

После сохранения параметров запустить CI для `main`. Создать первого пользователя
после успешного первого деплоя на сервере:

```bash
sudo bash
cd /opt/webstorage
export BACKEND_IMAGE="$(cat current/image)"
docker compose --env-file .env -f current/compose.yml exec backend \
  python -m app.cli create-user admin
```

Пароль вводится интерактивно. Приложение доступно по `PUBLIC_APP_URL`.
Для этих изменений дополнительная миграция схемы не создаётся; CD применяет
все имеющиеся миграции проекта.

## Диагностика и восстановление

Релизы: `/opt/webstorage/releases/<commit>-<run>-<attempt>`; текущий релиз:
`/opt/webstorage/current`; резервные копии: `/opt/webstorage/backups/*.dump`.
Для просмотра состояния и логов из root-shell:

```bash
cd /opt/webstorage
export BACKEND_IMAGE="$(cat current/image)"
docker compose --env-file .env -f current/compose.yml ps
docker compose --env-file .env -f current/compose.yml logs --tail=100 backend
nginx -t
```

При ошибке скрипт пытается вернуть прежние backend, HTML и nginx. Миграции
автоматически не откатываются: совместимость прежнего backend с новой схемой
не гарантируется. Если схема несовместима, требуется ручное восстановление
из указанного в логе дампа. Docker volumes не удаляются ни при деплое,
ни при ошибке. Дампы содержат БД, фотографии находятся в отдельном volume
`webstorage-production_media_data` и требуют отдельного резервного копирования.

Старые образы, релизы, дампы и хешированные `/var/www/html/assets/` намеренно
сохраняются для восстановления и открытых вкладок браузера. Настройте их
периодическую ротацию с учётом требуемого срока хранения; текущий и резервный
релизы/образы должны оставаться доступными. Не запускайте `compose down -v`
для production.
