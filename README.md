# Веб-склад

Два законченных vertical slice внутренней производственной системы: материалы, полуфабрикаты и продукты с транзакционным складским учётом. Пользователь может создать, найти, отфильтровать, отсортировать, отредактировать и архивировать позицию, провести приход/расход/корректировку/списание и открыть полную историю движений.

## Стек

- backend: Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2 async, asyncpg, Alembic, PostgreSQL;
- frontend: React 19, TypeScript strict, Vite, Gravity UI, SCSS Modules, React Router, TanStack Query;
- контракт: FastAPI OpenAPI → pinned `openapi-typescript`;
- качество: Ruff, mypy, pytest/httpx + PostgreSQL, ESLint, Stylelint, Vitest/Testing Library, production build.

Архитектурные решения описаны в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), дальнейшие этапы — в [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Быстрый запуск

Требуются Docker, Python 3.12+ и Node.js 22.12+ или 24+.

### 1. Окружение и PostgreSQL

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
```

PostgreSQL будет доступен на `localhost:5432`, данные сохраняются в named volume.

### 2. Backend

PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

Bash:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
alembic upgrade head
uvicorn app.main:app --reload
```

API: <http://localhost:8000/api/v1/materials> и <http://localhost:8000/api/v1/manufactured-items>. OpenAPI UI: <http://localhost:8000/docs>. Liveness: <http://localhost:8000/health/live>.

### 3. Frontend

В новом терминале:

```powershell
cd frontend
npm ci
npm run dev
```

Откройте <http://localhost:5173/warehouse>.

Локально `AUTH_DISABLED=true`, поэтому UI работает без экрана входа. Перед любым внешним развёртыванием отключите этот режим и задайте секретный `DEVELOPMENT_TOKEN`; полноценные пользователи, cookie-сессии и RBAC являются отдельным следующим security slice.

## OpenAPI → TypeScript

FastAPI является источником истины. Не редактируйте `frontend/src/shared/api/generated/schema.d.ts` вручную.

Активируйте backend virtualenv, затем выполните:

```powershell
cd frontend
npm run api:generate
```

Команда заново создаёт `backend/openapi.json`, затем генерирует TypeScript contract. CI проверяет, что оба артефакта актуальны.

## Проверки

### Backend и чистая test-БД

```powershell
docker compose --profile test up -d postgres-test
cd backend
$env:TEST_DATABASE_URL = "postgresql+asyncpg://webstorage:webstorage@localhost:5433/webstorage_test"
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\ruff check .
.\.venv\Scripts\mypy app
.\.venv\Scripts\pytest
```

pytest самостоятельно применяет Alembic к test-БД и очищает только таблицы test-БД между тестами. SQLite не используется.

### Frontend

```powershell
cd frontend
npm run typecheck
npm run lint
npm run stylelint
npm test
npm run build
```

## API реализованных срезов

| Метод | Путь | Назначение |
| --- | --- | --- |
| `POST` | `/api/v1/materials` | создать материал; начальный остаток становится приходом |
| `GET` | `/api/v1/materials` | список, pagination, search, sorting, availability/deficit filters |
| `GET` | `/api/v1/materials/{id}` | карточка и вычисленный остаток |
| `PATCH` | `/api/v1/materials/{id}` | изменить метаданные без изменения остатка |
| `POST` | `/api/v1/materials/{id}/archive` | архивировать |
| `POST` | `/api/v1/materials/{id}/movements` | провести складское движение |
| `GET` | `/api/v1/materials/{id}/movements` | пагинированная история |
| `POST` | `/api/v1/manufactured-items` | создать полуфабрикат/продукт; начальный остаток становится приходом |
| `GET` | `/api/v1/manufactured-items` | список, pagination, search, sorting, availability/kind filters |
| `GET` | `/api/v1/manufactured-items/{id}` | карточка и вычисленный остаток |
| `PATCH` | `/api/v1/manufactured-items/{id}` | изменить метаданные без изменения остатка |
| `POST` | `/api/v1/manufactured-items/{id}/archive` | архивировать |
| `POST` | `/api/v1/manufactured-items/{id}/movements` | провести складское движение |
| `GET` | `/api/v1/manufactured-items/{id}/movements` | пагинированная история |

Количество передаётся decimal-строкой. Для `receipt`, `consumption` и `write_off` клиент отправляет положительное количество; backend сохраняет расход как отрицательную ledger-дельту. `adjustment` принимает положительную или отрицательную ненулевую дельту. Отрицательный итоговый остаток запрещён.

## Остановка

```powershell
docker compose --profile test down
```

Обычный `down` не удаляет volume основной БД. Удаление данных через `down -v` намеренно не включено в стандартные команды.
