# Архитектура

## Границы реализованных срезов

Первый vertical slice реализует справочник материалов и складской ledger. Второй добавляет производимые складские позиции: полуфабрикаты и продукты. Производственные потребности пока не рассчитываются: `required_quantity`, `deficit_quantity` и `to_produce_quantity` являются вычисляемыми полями API и возвращают `0`. Контракт и модульные границы позволяют подключить production calculation engine без изменения каталогов и складских CRUD.

## Backend

Backend — один FastAPI-сервис, организованный по бизнес-модулям:

```text
backend/app/
├── api/                    # версия API и корневой router
├── core/                   # config, DB, ошибки, security boundary
└── modules/
    ├── materials/          # модель, DTO, запросы, use cases, HTTP
    ├── inventory/          # общие типы/правила и ledger материалов
    └── manufactured_items/ # каталог, строгий ledger, use cases, HTTP
```

Направление зависимостей: `router -> service -> repository/model -> core`. Repository выполняет запросы и `flush`, service владеет commit/rollback, router отвечает только за HTTP. ORM-модели не выходят через API.

Библиотеки: Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2 async, asyncpg, Alembic, PostgreSQL, pytest/httpx, Ruff и mypy.

## Данные и складские транзакции

Таблицы реализованных срезов:

- `materials`: UUID, название, единица, nullable цена/URL/изображение, архивный флаг, UTC timestamps;
- `inventory_movements`: UUID, материал, тип, signed decimal delta, остаток до/после, комментарий, источник, UTC timestamp.
- `manufactured_items`: UUID, название, признак продукта, единица, nullable изображение/active process, архивный флаг, UTC timestamps;
- `manufactured_item_movements`: UUID, производимая позиция, тип, signed decimal delta, остаток до/после, комментарий, источник, UTC timestamp.

Количества хранятся как `NUMERIC(20, 6)`, деньги — `NUMERIC(20, 2)`. API сериализует decimal как строки, поэтому JavaScript не теряет точность.

Оба ledger — источники истины фактического остатка соответствующего типа. Остаток равен сумме signed `quantity`; `balance_before/after` — проверяемый audit snapshot. Для каждого движения транзакция блокирует строку складской сущности `SELECT ... FOR UPDATE`, вычисляет остаток, запрещает отрицательное значение и вставляет движение. Параллельные списания одной позиции сериализуются. CRUD каталогов не принимает поле остатка. Начальный остаток создаётся как отдельный приход в той же транзакции.

Для этапа 2 выбран отдельный `manufactured_item_movements` со строгим FK вместо полиморфной ссылки без ссылочной целостности. Типы движений и функция преобразования ручной операции в signed delta общие. Обобщать repositories до сложной универсальной иерархии пока не требуется.

Физическое удаление не используется: материалы и производимые позиции архивируются. Архивные записи остаются в истории и не принимают новые движения.

## API boundary

REST API находится под `/api/v1`. Списки имеют offset pagination, детерминированную сортировку, поиск и явные фильтры. Ошибки имеют стабильный Problem Details-подобный DTO (`status`, `code`, `detail`, `fields`). OpenAPI FastAPI — единственный transport source of truth.

`backend/scripts/export_openapi.py` формирует `backend/openapi.json`; `npm run api:generate` запускает pinned `openapi-typescript` и пишет только в `frontend/src/shared/api/generated/`. Handwritten-код использует сгенерированные `components`/`paths`, но не редактирует их.

## Frontend

React 19 + TypeScript strict + Vite + Gravity UI + React Router + SCSS Modules. TanStack Query является единственным хранилищем server state. Поиск, фильтры, сортировка и страница хранятся в URL; формы/диалоги — локальный UI state.

```text
frontend/src/
├── app/                    # providers, router, theme, globals
├── pages/WarehousePage/
├── widgets/                # MaterialsTable, ManufacturedItemsTable
├── features/               # отдельные Create/Edit/Archive/Adjust/History slices
├── entities/               # Material, ManufacturedItem
└── shared/                 # generated API, fetch client, config/routes
```

Каждый slice экспортирует public API через `index.ts`; межслойных deep imports нет. Страница `/warehouse` лениво загружается. Gravity UI предоставляет controls/dialog/pagination/table primitives, SCSS использует semantic `--g-*` variables.

## Изображения

В реализованных срезах `image` — nullable HTTPS/HTTP URL. Frontend показывает preview и позволяет создать, заменить или удалить URL. Бинарные загрузки будут добавлены отдельным media-модулем с object storage, проверкой MIME/размера и signed URLs; текущие схемы не связывают transport хранения с доменной моделью.

## Авторизация

HTTP boundary уже централизован. `AUTH_DISABLED=true` допускается только для локального запуска и создаёт системного администратора. При `AUTH_DISABLED=false` все `/api/v1` endpoints требуют `Authorization: Bearer <DEVELOPMENT_TOKEN>` и fail closed. Это временный deploy-safe seam, а не пользовательская модель: таблицы пользователей, безопасные cookie-сессии и RBAC добавляются отдельным vertical slice до внешнего доступа.

## Миграции и эксплуатация

Любая схема изменяется только Alembic. Миграция `20260828_0001` создаёт материалы и их ledger, `20260828_0002` — производимые позиции и отдельный строгий ledger. PostgreSQL запускается Docker Compose; backend/frontend работают на host для быстрого reload/HMR. Production предполагает same-origin reverse proxy и отдельное object storage.
