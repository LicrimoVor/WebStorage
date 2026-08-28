# Архитектура

## Границы первого среза

Первый vertical slice реализует справочник материалов и складской ledger. Производственные потребности пока не рассчитываются: `required_quantity` и `deficit_quantity` являются вычисляемыми полями API и возвращают `0`. Контракт и модульные границы позволяют подключить production calculation engine без изменения CRUD материалов.

## Backend

Backend — один FastAPI-сервис, организованный по бизнес-модулям:

```text
backend/app/
├── api/                    # версия API и корневой router
├── core/                   # config, DB, ошибки, security boundary
└── modules/
    ├── materials/          # модель, DTO, запросы, use cases, HTTP
    └── inventory/          # ledger, транзакции, история, HTTP
```

Направление зависимостей: `router -> service -> repository/model -> core`. Repository выполняет запросы и `flush`, service владеет commit/rollback, router отвечает только за HTTP. ORM-модели не выходят через API.

Библиотеки: Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2 async, asyncpg, Alembic, PostgreSQL, pytest/httpx, Ruff и mypy.

## Данные и складские транзакции

Таблицы первого среза:

- `materials`: UUID, название, единица, nullable цена/URL/изображение, архивный флаг, UTC timestamps;
- `inventory_movements`: UUID, материал, тип, signed decimal delta, остаток до/после, комментарий, источник, UTC timestamp.

Количества хранятся как `NUMERIC(20, 6)`, деньги — `NUMERIC(20, 2)`. API сериализует decimal как строки, поэтому JavaScript не теряет точность.

Ledger `inventory_movements` — источник истины фактического остатка. Остаток равен сумме signed `quantity`; `balance_before/after` — проверяемый audit snapshot. Для каждого движения транзакция блокирует строку материала `SELECT ... FOR UPDATE`, вычисляет остаток, запрещает отрицательное значение и вставляет движение. Параллельные списания одного материала сериализуются. CRUD материала не принимает поле остатка. Начальный остаток создаётся как отдельный приход в той же транзакции.

Физическое удаление не используется: материал архивируется. Архивные записи остаются в истории и не принимают новые движения.

## API boundary

REST API находится под `/api/v1`. Списки имеют offset pagination, детерминированную сортировку, поиск и явные фильтры. Ошибки имеют стабильный Problem Details-подобный DTO (`status`, `code`, `detail`, `fields`). OpenAPI FastAPI — единственный transport source of truth.

`backend/scripts/export_openapi.py` формирует `backend/openapi.json`; `npm run api:generate` запускает pinned `openapi-typescript` и пишет только в `frontend/src/shared/api/generated/`. Handwritten-код использует сгенерированные `components`/`paths`, но не редактирует их.

## Frontend

React 19 + TypeScript strict + Vite + Gravity UI + React Router + SCSS Modules. TanStack Query является единственным хранилищем server state. Поиск, фильтры, сортировка и страница хранятся в URL; формы/диалоги — локальный UI state.

```text
frontend/src/
├── app/                    # providers, router, theme, globals
├── pages/WarehousePage/
├── widgets/MaterialsTable/
├── features/               # Create/Edit/Archive/Adjust/History
├── entities/Material/      # transport adapters, model, entity UI
└── shared/                 # generated API, fetch client, config/routes
```

Каждый slice экспортирует public API через `index.ts`; межслойных deep imports нет. Страница `/warehouse` лениво загружается. Gravity UI предоставляет controls/dialog/pagination/table primitives, SCSS использует semantic `--g-*` variables.

## Изображения

В первом срезе `image` — nullable HTTPS/HTTP URL. Frontend показывает preview и позволяет создать, заменить или удалить URL. Бинарные загрузки будут добавлены отдельным media-модулем с object storage, проверкой MIME/размера и signed URLs; текущая схема материала не связывает transport хранения с доменной моделью.

## Авторизация

HTTP boundary уже централизован. `AUTH_DISABLED=true` допускается только для локального запуска и создаёт системного администратора. При `AUTH_DISABLED=false` все `/api/v1` endpoints требуют `Authorization: Bearer <DEVELOPMENT_TOKEN>` и fail closed. Это временный deploy-safe seam, а не пользовательская модель: таблицы пользователей, безопасные cookie-сессии и RBAC добавляются отдельным vertical slice до внешнего доступа.

## Миграции и эксплуатация

Любая схема изменяется только Alembic. Initial migration создаёт обе таблицы, ограничения, FK и индексы. PostgreSQL запускается Docker Compose; backend/frontend работают на host для быстрого reload/HMR. Production предполагает same-origin reverse proxy и отдельное object storage.

