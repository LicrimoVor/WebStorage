# Веб-склад

Законченные vertical slice внутренней производственной системы: склад материалов/полуфабрикатов/продуктов, справочники операций и персонала, версионируемые технологические процессы с Canvas-редактором, планирование и атомарная регистрация выпуска, payroll, продажи, финансы, аналитика и серверный Excel-экспорт. Планы рекурсивно рассчитывают потребности, а факт производства списывает компоненты, приходует результат и обновляет прогресс одной транзакцией.

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

API-каталоги: `/api/v1/materials`, `/api/v1/manufactured-items`, `/api/v1/operations`, `/api/v1/employees`, `/api/v1/technological-processes`, `/api/v1/production-plans`, `/api/v1/exports/{dataset}.xlsx`. OpenAPI UI: <http://localhost:8000/docs>. Liveness: <http://localhost:8000/health/live>.

### 3. Frontend

В новом терминале:

```powershell
cd frontend
npm ci
npm run dev
```

Откройте <http://localhost:5173/production-plans>, <http://localhost:5173/warehouse>, <http://localhost:5173/processes>, <http://localhost:5173/operations> или <http://localhost:5173/personnel>.

Локально `AUTH_DISABLED=true`, поэтому UI работает без экрана входа. Перед любым внешним развёртыванием отключите этот режим и задайте секретный `DEVELOPMENT_TOKEN`; полноценные пользователи, cookie-сессии и RBAC являются отдельным следующим security slice.

## Технологические процессы

Этап 4 доступен в UI по адресам <http://localhost:5173/processes> и `/processes/{processId}`. В списке можно создать процесс для производимой позиции, импортировать JSON и архивировать процесс. Редактор показывает версии, узлы и связи, позволяет править JSON только у черновика, экспортировать любую версию и запускать отдельную строгую активацию.

Основные API-группы:

| Метод | Путь | Назначение |
| --- | --- | --- |
| `POST/GET` | `/api/v1/technological-processes` | создать процесс с v1 draft или получить список |
| `POST` | `/api/v1/technological-processes/import` | импортировать полный или неполный JSON как новый draft |
| `POST/GET` | `/api/v1/technological-processes/{id}/versions` | клонировать новую версию или получить историю |
| `GET` | `/api/v1/technological-processes/{id}/versions/{versionId}/export` | экспортировать переносимый JSON |
| `PUT` | `/api/v1/technological-processes/{id}/versions/{versionId}/graph` | заменить граф черновика |
| `POST` | `/api/v1/technological-processes/{id}/versions/{versionId}/activate` | проверить DAG и активировать версию |

## Производственное планирование

Экран <http://localhost:5173/production-plans> создаёт планы по продукту и количеству. Backend закрепляет план за версией техпроцесса, рекурсивно раскрывает полуфабрикаты, учитывает их остатки и сохраняет рассчитанные потребности. Для открытого плана доступны изменение количества/прогресса через API, отмена и явный перерасчёт по текущей активной версии процесса.

| Метод | Путь | Назначение |
| --- | --- | --- |
| `POST/GET` | `/api/v1/production-plans` | создать рассчитанный план или получить список |
| `GET/PATCH` | `/api/v1/production-plans/{id}` | получить карточку или изменить открытый план |
| `POST` | `/api/v1/production-plans/{id}/recalculate` | пересчитать и при необходимости закрепить новую активную версию |
| `GET` | `/api/v1/production-plans/summary` | сводка активных планов, времени, стоимости и дефицита |
| `POST` | `/api/v1/production-plans/{id}/production-records` | провести выпуск с обязательным `Idempotency-Key` |
| `GET` | `/api/v1/production-plans/{id}/production-records` | получить историю выпуска по плану |

Проведение производства использует закреплённую версию техпроцесса. При нехватке компонента вся команда откатывается; повтор с тем же `Idempotency-Key` безопасно возвращает уже созданную запись без повторных движений.

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
| `POST/GET` | `/api/v1/operations` | создать или получить список операций |
| `GET/PATCH` | `/api/v1/operations/{id}` | получить или изменить операцию |
| `POST` | `/api/v1/operations/{id}/archive` | архивировать операцию |
| `POST/GET` | `/api/v1/employees` | добавить сотрудника или получить список |
| `GET/PATCH` | `/api/v1/employees/{id}` | получить или изменить сотрудника |
| `POST` | `/api/v1/employees/{id}/archive` | деактивировать сотрудника |
| `POST/GET` | `/api/v1/operations/{id}/work-entries` | записать выполненную операцию или получить её историю |
| `GET/PATCH` | `/api/v1/work-entries/{id}` | получить или изменить неоплаченную запись работы |
| `POST` | `/api/v1/work-entries/{id}/void` | аннулировать неоплаченную запись с сохранением аудита |
| `GET` | `/api/v1/employees/{id}/work-entries` | получить историю работ сотрудника |
| `POST/GET` | `/api/v1/employees/{id}/payments` | провести выплату или получить историю выплат и распределений |
| `GET` | `/api/v1/employees/{id}/payroll-summary` | агрегаты сотрудника и детализация по операциям |
| `POST/GET` | `/api/v1/sales` | атомарно зарегистрировать продажу или получить журнал с фильтрами |
| `GET` | `/api/v1/sales/summary` | количество, выручка и средняя цена выбранных продаж |
| `POST` | `/api/v1/finance/transactions` | добавить ручной доход или расход |
| `GET` | `/api/v1/finance/entries` | единый журнал продаж, материалов, выплат и ручных операций |
| `GET` | `/api/v1/finance/summary` | доходы, расходы, баланс и детализация источников за период |
| `GET` | `/api/v1/analytics/dashboard` | агрегированная аналитика производства, продаж, склада и персонала за период |
| `GET` | `/api/v1/exports/{dataset}.xlsx` | серверная Excel-выгрузка всех строк по текущим фильтрам или выбранным UUID |
| `POST` | `/api/v1/manufactured-items/{id}/production-preview` | рассчитать рекурсивное производство, складские потребности и операции |
| `POST` | `/api/v1/manufactured-items/{id}/produce` | атомарно произвести позицию без плана и записать назначенные/анонимные работы |

Количество передаётся decimal-строкой. Для `receipt`, `consumption` и `write_off` клиент отправляет положительное количество; backend сохраняет расход как отрицательную ledger-дельту. `adjustment` принимает положительную или отрицательную ненулевую дельту. Отрицательный итоговый остаток запрещён.

`time_norm` хранится как decimal-число минут на одну операцию, `price_per_operation` — как денежное decimal-значение. При записи выполненной работы значения фиксируются историческим snapshot. Сдельное начисление считается по количеству либо по эквиваленту `затраченные минуты / норма`; почасовое — по затраченным минутам и ставке сотрудника. В персонале рядом отображаются выполненный и оплаченный эквиваленты. Выплата по умолчанию распределяется по старейшим неоплаченным начислениям (FIFO), также доступно точное ручное распределение.

Продажа требует `Idempotency-Key`, фиксирует цену и сумму и атомарно списывает готовый продукт. Финансовая сводка использует продажи как доход, выплаты как расходы на труд, отрицательные движения материалов с исторической ценой как материальные расходы и отдельный журнал ручных операций.

## Остановка

```powershell
docker compose --profile test down
```

Обычный `down` не удаляет volume основной БД. Удаление данных через `down -v` намеренно не включено в стандартные команды.
