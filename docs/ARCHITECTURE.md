# Архитектура

## Границы реализованных срезов

Первый vertical slice реализует справочник материалов и складской ledger. Второй добавляет производимые складские позиции: полуфабрикаты и продукты. Третий реализует справочники производственных операций и сотрудников. Производственные потребности и выполненные работы пока не рассчитываются: соответствующие агрегаты API возвращают `0`. Контракт и модульные границы позволяют подключить planning, work и payroll engines без изменения каталогов.

## Backend

Backend — один FastAPI-сервис, организованный по бизнес-модулям:

```text
backend/app/
├── api/                    # версия API и корневой router
├── core/                   # config, DB, ошибки, security boundary
└── modules/
    ├── materials/          # модель, DTO, запросы, use cases, HTTP
    ├── inventory/          # общие типы/правила и ledger материалов
    ├── manufactured_items/ # каталог, строгий ledger, use cases, HTTP
    ├── operations/         # нормы времени и ставки операций
    └── employees/          # активный персонал и комментарии
```

Направление зависимостей: `router -> service -> repository/model -> core`. Repository выполняет запросы и `flush`, service владеет commit/rollback, router отвечает только за HTTP. ORM-модели не выходят через API.

Библиотеки: Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2 async, asyncpg, Alembic, PostgreSQL, pytest/httpx, Ruff и mypy.

## Данные и складские транзакции

Таблицы реализованных срезов:

- `materials`: UUID, название, единица, nullable цена/URL/изображение, архивный флаг, UTC timestamps;
- `inventory_movements`: UUID, материал, тип, signed decimal delta, остаток до/после, комментарий, источник, UTC timestamp.
- `manufactured_items`: UUID, название, признак продукта, единица, nullable изображение/active process, архивный флаг, UTC timestamps;
- `manufactured_item_movements`: UUID, производимая позиция, тип, signed decimal delta, остаток до/после, комментарий, источник, UTC timestamp.
- `operations`: UUID, уникальное название, nullable норма времени в минутах, nullable ставка, архивный флаг, UTC timestamps;
- `employees`: UUID, ФИО, active-флаг, nullable комментарий, UTC timestamps.

Количества хранятся как `NUMERIC(20, 6)`, деньги — `NUMERIC(20, 2)`. API сериализует decimal как строки, поэтому JavaScript не теряет точность.

Оба ledger — источники истины фактического остатка соответствующего типа. Остаток равен сумме signed `quantity`; `balance_before/after` — проверяемый audit snapshot. Для каждого движения транзакция блокирует строку складской сущности `SELECT ... FOR UPDATE`, вычисляет остаток, запрещает отрицательное значение и вставляет движение. Параллельные списания одной позиции сериализуются. CRUD каталогов не принимает поле остатка. Начальный остаток создаётся как отдельный приход в той же транзакции.

Для этапа 2 выбран отдельный `manufactured_item_movements` со строгим FK вместо полиморфной ссылки без ссылочной целостности. Типы движений и функция преобразования ручной операции в signed delta общие. Обобщать repositories до сложной универсальной иерархии пока не требуется.

Физическое удаление не используется: материалы, производимые позиции и операции архивируются, сотрудники деактивируются. Архивные записи сохраняются для будущих исторических связей.

Поля операций `required_quantity`, `completed_quantity`, `required_time_minutes` и агрегаты сотрудника `accrued_total`, `paid_total`, `payable_total`, `completed_operations` являются read-only projections. До появления планирования, учёта работ и payroll они равны нулю и не сохраняются как изменяемые поля каталогов.

## Технологические процессы

`technological_processes` — стабильная сущность с названием и производимой позицией. Изменяемый граф хранится в `technological_process_versions`, `technological_process_nodes` и `technological_process_edges`. UUID в `manufactured_items.active_process_id` указывает именно на активную версию, поэтому последующие расчёты смогут закреплять воспроизводимый snapshot, а не «последнее» состояние процесса.

Версии проходят состояния `draft → active → archived`. Узлы и рёбра активной/архивной версии не изменяются; крупное изменение начинается клонированием исходного графа в новый draft. Активация выполняется отдельной транзакционной командой под блокировкой процесса и одновременно архивирует предыдущую активную версию.

Черновик намеренно допускает `referenceId = null`, отсутствующее количество и разорванные рёбра — это необходимо для частичного JSON-импорта и будущего canvas autosave. Перед активацией service layer проверяет:

- ровно один финальный output и его соответствие результату процесса;
- существование и неархивное состояние материалов, операций и производимых позиций;
- положительное decimal-количество каждой зависимости и существование обоих концов ребра;
- отсутствие локального цикла и наличие пути от каждого узла к финальному output;
- отсутствие рекурсивного цикла между производимыми позициями по всем активным версиям.

Рёбра с направлением `source → target` означают, что source необходим для получения target. Количество относится к зависимости, а не к узлу. Полиморфный `reference_id` узла проверяется сервисом при активации; физический FK невозможен, поскольку ссылка выбирает одну из трёх таблиц справочников.

## API boundary

REST API находится под `/api/v1`. Списки имеют offset pagination, детерминированную сортировку, поиск и явные фильтры. Ошибки имеют стабильный Problem Details-подобный DTO (`status`, `code`, `detail`, `fields`). OpenAPI FastAPI — единственный transport source of truth.

`backend/scripts/export_openapi.py` формирует `backend/openapi.json`; `npm run api:generate` запускает pinned `openapi-typescript` и пишет только в `frontend/src/shared/api/generated/`. Handwritten-код использует сгенерированные `components`/`paths`, но не редактирует их.

## Frontend

React 19 + TypeScript strict + Vite + Gravity UI + React Router + SCSS Modules. TanStack Query является единственным хранилищем server state. Поиск, фильтры, сортировка и страница хранятся в URL; формы/диалоги — локальный UI state.

```text
frontend/src/
├── app/                    # providers, router, theme, globals
├── pages/                  # WarehousePage, OperationsPage, PersonnelPage
├── widgets/                # таблицы четырёх каталогов
├── features/               # отдельные Create/Edit/Archive/Adjust/History slices
├── entities/               # Material, ManufacturedItem, Operation, Employee
└── shared/                 # generated API, fetch client, config/routes
```

Каждый slice экспортирует public API через `index.ts`; межслойных deep imports нет. Страницы `/warehouse`, `/operations` и `/personnel` лениво загружаются. Gravity UI предоставляет controls/dialog/pagination/table primitives, SCSS использует semantic `--g-*` variables.

## Изображения

В реализованных срезах `image` — nullable HTTPS/HTTP URL. Frontend показывает preview и позволяет создать, заменить или удалить URL. Бинарные загрузки будут добавлены отдельным media-модулем с object storage, проверкой MIME/размера и signed URLs; текущие схемы не связывают transport хранения с доменной моделью.

## Авторизация

HTTP boundary уже централизован. `AUTH_DISABLED=true` допускается только для локального запуска и создаёт системного администратора. При `AUTH_DISABLED=false` все `/api/v1` endpoints требуют `Authorization: Bearer <DEVELOPMENT_TOKEN>` и fail closed. Это временный deploy-safe seam, а не пользовательская модель: таблицы пользователей, безопасные cookie-сессии и RBAC добавляются отдельным vertical slice до внешнего доступа.

## Миграции и эксплуатация

Любая схема изменяется только Alembic. Миграция `20260828_0001` создаёт материалы и их ledger, `20260828_0002` — производимые позиции и отдельный строгий ledger, `20260828_0003` — операции и сотрудников. PostgreSQL запускается Docker Compose; backend/frontend работают на host для быстрого reload/HMR. Production предполагает same-origin reverse proxy и отдельное object storage.
