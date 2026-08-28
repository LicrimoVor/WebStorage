# План реализации

## 1. Foundation + Materials + Inventory — реализовано

- Scope: локальный запуск, material CRUD/archive, поиск/фильтры/сортировка/пагинация, приход/расход/корректировка/списание, остаток и история.
- Backend: FastAPI-модули `materials` и `inventory`, transaction ledger, Problem Details, health endpoints, auth boundary.
- Frontend: `/warehouse`, Material entity, Create/Edit/Archive/Adjust/History features, loading/empty/error/content.
- Migrations: `materials`, `inventory_movements`, constraints/indexes.
- Tests: PostgreSQL API integration, React component/user flows, lint/typecheck/build.
- Dependencies: отсутствуют.

## 2. Manufactured items / Products

- Scope: производимые складские сущности и признак продукта.
- Backend: `manufactured_items`, общий inventory port для разных item types.
- Frontend: entity/table/create/edit/archive/stock features в секции склада.
- Migrations: manufactured items и generalized ledger reference либо отдельный строгий ledger.
- Tests: CRUD, движения, фильтры, запрет отрицательных остатков.
- Dependencies: этап 1.

## 3. Operations + Employees

- Scope: справочники операций/сотрудников без расчёта производства и payroll.
- Backend: CRUD/archive, нормы времени и ставки decimal.
- Frontend: страницы операций и персонала, формы/таблицы.
- Migrations: `operations`, `employees`.
- Tests: validation, archive, search/pagination.
- Dependencies: foundation этапа 1.

## 4. Tech Process domain model

- Scope: версии, узлы/рёбра, draft/active/archive, валидация DAG, JSON import/export.
- Backend: `technological_processes`, cycle detection и activation use case.
- Frontend: список процессов и не-canvas редактор структуры/сопоставления.
- Migrations: process/version/node/edge tables и единственная active version.
- Tests: version immutability, cycles, invalid references, round-trip JSON.
- Dependencies: этапы 2–3.

## 5. Tech Process Canvas editor

- Scope: графический editor, autosave, undo/redo, Excalidraw import/export.
- Backend: optimistic draft revisions/autosave endpoint.
- Frontend: canvas adapter, typed graph model, status saving, accessibility fallback.
- Migrations: draft revision/version metadata при необходимости.
- Tests: graph editing, autosave conflicts, imports and E2E activation.
- Dependencies: этап 4.

## 6. Production planning/calculation engine

- Scope: планы, recursive requirements, stock-aware expansion, materials/items/operations/hours/deficit.
- Backend: version-pinned deterministic calculation service and persisted plan snapshots.
- Frontend: dashboard plan creation/results and calculated warehouse fields.
- Migrations: plans, requirement snapshots, process version links.
- Tests: nested BOM, aggregation, available semi-finished stock, rounding, cycles defense.
- Dependencies: этапы 1–5.

## 7. Production execution

- Scope: atomic production record, component write-off, output receipt, plan progress.
- Backend: one transaction over inventory and plan; idempotency key.
- Frontend: register production feature and updated plan/stock states.
- Migrations: production records, idempotency and source references.
- Tests: success, insufficient stock rollback, replay, concurrency.
- Dependencies: этап 6.

## 8. Employee work + Payroll

- Scope: work entries by count/time, historical rates, accruals, payments/allocation.
- Backend: work/payroll modules and FIFO/manual allocations.
- Frontend: expanded operation/employee tables, work/payment flows.
- Migrations: work entries, payments, allocations.
- Tests: historical prices, partial payments, edits/audit, decimal rules.
- Dependencies: этапы 3, 6–7.

## 9. Sales + Finance

- Scope: sales with stock write-off, income/expense ledger, material/labour/sales aggregation.
- Backend: atomic sales and financial transaction modules.
- Frontend: sales/finance pages and period filters.
- Migrations: sales, financial transactions, historical price snapshots.
- Tests: insufficient stock, totals, rollback, permissions.
- Dependencies: этапы 2, 7–8.

## 10. Analytics

- Scope: production, sales, stock and personnel metrics.
- Backend: indexed aggregate queries/read models.
- Frontend: period-based dashboards and Gravity charts/tables.
- Migrations: only measured indexes/materialized views when justified.
- Tests: aggregate fixtures, timezone boundaries, query budgets.
- Dependencies: этапы 6–9.

## 11. Excel export

- Scope: server-side `.xlsx` for filtered datasets and selected IDs.
- Backend: streaming export jobs preserving decimal/date cell types and labels.
- Frontend: export actions reusing current URL filters.
- Migrations: optional async job metadata.
- Tests: workbook schema/types/filter parity and large result behavior.
- Dependencies: corresponding tables from stages 1–10.

## 12. Operation instructions + Markdown/images/public links/export

- Scope: draft/publish/version history, safe Markdown, images, public tokens/QR, md/txt/docx/pdf.
- Backend: instruction/media/publication/export modules, sanitization and expiring revocation.
- Frontend: editor/preview, operation and public responsive pages.
- Migrations: instruction/version/assets/public links and permission/audit data.
- Tests: XSS, publication isolation, link rotation/expiry, export fidelity, mobile E2E.
- Dependencies: этап 3 и production-ready authentication/RBAC.

