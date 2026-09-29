# Деплой из репозитория на сервере

После успешного CI для `main` вызывается CD. Повторный запуск: **Actions → CI →
Run workflow**, ветка `main`. Pull request не запускает деплой.

Все команды находятся непосредственно в `.github/workflows/cd.yml`, без отдельных
shell-скриптов. GitHub Actions выполняет деплои последовательно:

1. Скачивает архив frontend из артефактов текущего CI и проверяет подключение по SSH.
   CI собирает frontend с `VITE_API_URL=/api/v1` и сохраняет `frontend.tar.gz`.
2. Выполняет `git fetch origin main` и переключается на конкретный коммит,
   прошедший CI. Если `main` уже обновилась, старый деплой отменяется. Локальные
   изменения отслеживаемых файлов запрещены; принудительного `reset`/`clean` нет.
   При первом запуске клонирует репозиторий в `/opt/webstorage/repository`.
3. Из репозитория собирает backend через `deploy/compose.yml`.
4. Запускает PostgreSQL, останавливает backend, сохраняет дамп БД и применяет
   `alembic upgrade head`. Запускает backend и ожидает healthcheck.
5. Устанавливает `deploy/nginx.conf` с доменом из `PUBLIC_APP_URL`, выполняет
   `nginx -t` и перезагружает Nginx.
6. Передаёт архив frontend по SSH, распаковывает во временную папку, обновляет
   статику в `/var/www/html/` и атомарно заменяет `index.html`.

Frontend и backend соответствуют одному коммиту. Frontend собирается в GitHub Actions,
backend — на сервере до остановки работающего контейнера. Docker Registry не нужен.

В production frontend регистрирует `/sw.js` через HTTPS (локально допустим localhost).
Service worker кеширует только JS, CSS и шрифты из `/assets/` и страницу `/offline.html`.
API, фотографии и страницы кабинета не сохраняются в этот кеш. При недоступной сети
навигация показывает страницу с кнопкой повтора; операции со складом требуют сети.
Обновлённый worker активируется после закрытия вкладок с предыдущей версией.
При изменении offline-страницы увеличьте версию `CACHE` в `frontend/public/sw.js`.
Индексация кабинета остаётся закрытой через метатеги и заголовок Nginx.

## Подготовка сервера

Нужны Ubuntu/Debian с systemd, Git, Docker Engine и
Docker Compose v2.24+ (либо v5), Nginx, rsync, Python 3, tar и Certbot.
Домен должен указывать на сервер, порты 80/443 и SSH — быть доступны.
Каталог `/var/www/html/` должен принадлежать только этому приложению.

```bash
sudo apt-get update
sudo apt-get install -y git nginx rsync python3 curl certbot openssl util-linux
docker compose version
sudo install -d -m 700 /opt/webstorage
sudoedit /opt/webstorage/.env
sudo chmod 600 /opt/webstorage/.env
```

В `.env` скопируйте `deploy/production.env.example`, задайте домен без
завершающего слеша и параметры PostgreSQL. Docker установите перед первым
запуском CD. Node.js и npm на сервере не нужны: frontend приходит готовым архивом.
Не меняйте пароль существующей БД только через `.env`: PostgreSQL применяет
переменные инициализации только к пустому volume.

### Доступ сервера к GitHub

Git выполняется от **root** через `sudo`. Создайте отдельный SSH-ключ для
чтения репозитория, добавьте публичную часть в **Repository → Settings →
Deploy keys** без права записи. Приватный ключ разместите в `/root/.ssh/github_deploy`
с правами `600`.
Добавьте проверенный SSH-ключ GitHub в `/root/.ssh/known_hosts`.
Это отдельный ключ, не `DEPLOY_SSH_KEY`, которым Actions входит на сервер.

Проверка от root (подставьте владельца и имя репозитория):

```bash
sudo env GIT_SSH_COMMAND='ssh -i /root/.ssh/github_deploy -o IdentitiesOnly=yes' git ls-remote git@github.com:OWNER/REPOSITORY.git refs/heads/main
```

На повторных деплоях используется существующий checkout с таким же SSH URL
в `origin`. Не редактируйте файлы приложения на сервере: меняйте их через Git.
Секреты остаются в `/opt/webstorage/.env`, вне checkout.

### HTTPS и SSH

До первого деплоя получите сертификат для домена из `PUBLIC_APP_URL`:

```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone -d storage.example.com
sudo systemctl start nginx
```

Workflow ожидает сертификат и ключ в `/etc/letsencrypt/live/ДОМЕН/`.
После деплоя настройте автоматическое обновление сертификата через webroot
`/var/www/html` и перезагрузку Nginx после обновления. Каталог `.well-known`
деплой не удаляет.

SSH-пользователю CD нужны ключ в `~/.ssh/authorized_keys` и возможность
`sudo -n bash` без пароля. Пример для отдельного пользователя `deploy`:

```text
deploy ALL=(root) NOPASSWD: /usr/bin/bash
```

## GitHub Environment production

| Secret | Значение |
| --- | --- |
| `DEPLOY_HOST` | IPv4 или DNS сервера |
| `DEPLOY_USER` | SSH-пользователь |
| `DEPLOY_SSH_KEY` | Приватный ключ входа на сервер, без passphrase |
| `DEPLOY_KNOWN_HOSTS` | Проверенный SSH-ключ сервера в формате known_hosts |

Variable `DEPLOY_PORT` необязательна, по умолчанию `22`. Для другого порта
запись known_hosts должна содержать `[host]:port`. Ограничьте Environment веткой `main`.

## Управление приложением

Перед запуском новой версии примените `alembic upgrade head` (CD делает это автоматически).
Миграция `20260929_0019` добавляет права по разделам; существующие роли сохраняются.
После входа администратор может добавлять и настраивать пользователей в
**Настройки → Пользователи**. Отключение учётной записи, смена логина или пароля
завершают её сессии. Права проверяются на каждом запросе; шапка обновляется в течение
30 секунд или при возвращении на вкладку. Управление пользователями и журнал доступны
только администратору. Первый администратор создаётся командой ниже.

Из root-shell:

```bash
cd /opt/webstorage/repository
docker compose --env-file /opt/webstorage/.env -f deploy/compose.yml ps
docker compose --env-file /opt/webstorage/.env -f deploy/compose.yml logs --tail=100 backend
docker compose --env-file /opt/webstorage/.env -f deploy/compose.yml run --rm --no-deps backend python -m app.cli create-user admin
docker compose --env-file /opt/webstorage/.env -f deploy/compose.yml run --rm --no-deps backend python -m app.cli reset-password admin
```

Пароли вводятся интерактивно. `reset-password` снимает временную блокировку
и отзывает сессии, но не активирует отключённого пользователя. Для просмотра
логинов используйте `list-users`.

## Восстановление и переход со старого CD

Имя Compose-проекта остаётся `webstorage-production`, поэтому существующие
volumes БД и фотографий сохраняются. PostgreSQL не публикует порт, backend
доступен на хосте только по `127.0.0.1:8000`. Nginx обслуживает `/api/`, `/media/`
и SPA.

В `/opt/webstorage/backups/<date>.dump` сохраняется дамп БД перед миграциями.
При ошибке workflow останавливается на соответствующем шаге.
Если `nginx -t` завершается ошибкой, Nginx не перезагружается.
Если ошибка произошла после остановки backend, он может
остаться остановленным до исправления и повторного деплоя.
Автоматического отката backend, статики и миграций нет. Фотографии хранятся отдельно в volume
`webstorage-production_media_data` и требуют отдельного резервного копирования.

Старые хешированные assets сохраняются для открытых вкладок и возврата HTML.
Настройте ротацию assets, дампов и старых Docker-образов. Не выполняйте
`compose down -v` в production.

Старые `/opt/webstorage/releases` и ссылка `current` больше не используются.
После успешного перехода их можно удалить вручную, сохранив необходимые
резервные копии. CD не удаляет существующие серверные данные автоматически.
