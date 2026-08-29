# План реализации

## 1. Foundation + Materials + Inventory — реализовано

- Scope: локальный запуск, material CRUD/archive, поиск/фильтры/сортировка/пагинация, приход/расход/корректировка/списание, остаток и история.
- Backend: FastAPI-модули `materials` и `inventory`, transaction ledger, Problem Details, health endpoints, auth boundary.
- Frontend: `/warehouse`, Material entity, Create/Edit/Archive/Adjust/History features, loading/empty/error/content.
- Migrations: `materials`, `inventory_movements`, constraints/indexes.
- Tests: PostgreSQL API integration, React component/user flows, lint/typecheck/build.
- Dependencies: отсутствуют.

## 2. Manufactured items / Products — реализовано

- Scope: производимые складские сущности и признак продукта.
- Backend: `manufactured_items`, общие типы и правила движений, отдельный ledger со строгим FK и row-level serialization.
- Frontend: ManufacturedItem entity, table и Create/Edit/Archive/Adjust/History features во второй секции `/warehouse`.
- Migrations: `manufactured_items`, `manufactured_item_movements`, constraints/indexes.
- Tests: PostgreSQL CRUD/движения/фильтры/отрицательный остаток и React component/user flows.
- Dependencies: этап 1.

## 3. Operations + Employees — реализовано

- Scope: справочники операций/сотрудников без расчёта производства и payroll.
- Backend: модули `operations` и `employees`, CRUD/archive, nullable decimal-нормы времени и ставки, read-only placeholders будущих агрегатов.
- Frontend: `/operations` и `/personnel`, entity/table и Create/Edit/Archive features, URL search/sort/pagination.
- Migrations: `operations`, `employees`, constraints/indexes.
- Tests: PostgreSQL validation/archive/search/pagination и React component/user flows.
- Dependencies: foundation этапа 1.

## 4. Tech Process domain model — реализовано

- Scope: версии, узлы/рёбра, draft/active/archive, валидация DAG, JSON import/export.
- Backend: `technological_processes`, cycle detection и activation use case.
- Frontend: список процессов и не-canvas редактор структуры/сопоставления.
- Migrations: process/version/node/edge tables и единственная active version.
- Tests: version immutability, cycles, invalid references, round-trip JSON.
- Dependencies: этапы 2–3.

Реализованный контракт этапа:

- один технологический процесс закреплён за одной производимой позицией, а его история хранится отдельными версиями;
- изменяется только `draft`; активация архивирует предыдущую активную версию и записывает UUID новой версии в `manufactured_items.active_process_id`;
- неполный импорт остаётся допустимым черновиком, но activation command проверяет сопоставления, архивные/отсутствующие ссылки, положительные количества, целостность рёбер, путь каждого узла к результату и единственный финальный output;
- циклы запрещены и внутри версии, и между активными процессами производимых позиций;
- JSON schema version 1 является переносимым контрактом импорта/экспорта; decimal-количества передаются строками без потери точности;
- frontend добавляет `/processes` и `/processes/:processId`: список, версии, статусы, автор, импорт/экспорт, табличную структуру узлов/связей и JSON-редактирование черновика.

## 5. Tech Process Canvas editor — реализовано

- Scope: графический editor, autosave, undo/redo, Excalidraw import/export.
- Backend: optimistic draft revisions/autosave endpoint.
- Frontend: canvas adapter, typed graph model, status saving, accessibility fallback.
- Migrations: draft revision/version metadata при необходимости.
- Tests: graph editing, autosave conflicts, imports and E2E activation.
- Dependencies: этап 4.

Реализованный контракт этапа:

- черновик редактируется на масштабируемом и перемещаемом полотне: узлы можно добавлять, сопоставлять, перемещать и удалять, связи — создавать, редактировать по количеству и удалять;
- изменения автоматически сохраняются после короткой паузы, видимый статус различает несохранённые изменения, сохранение, успех и ошибку; ручное сохранение доступно отдельно;
- каждое сохранение передаёт ожидаемую ревизию, поэтому устаревшая вкладка получает конфликт вместо тихого перезаписывания более нового графа;
- Undo/Redo работает для изменений графа, активация остаётся отдельной командой и перед запуском принудительно сохраняет текущий черновик;
- системный `.excalidraw` экспорт сохраняет типы, ссылки и количества без потерь; импорт произвольных прямоугольников, связанных стрелками, поддерживается как частичный несопоставленный черновик;
- параллельно с этапом улучшен складской UI: единицы выбираются из справочника, изображения принимают URL или локальную загрузку с preview, а полуфабрикаты и продукты показываются отдельными таблицами.

## 6. Production planning/calculation engine — реализовано

- Scope: планы, recursive requirements, stock-aware expansion, materials/items/operations/hours/deficit.
- Backend: version-pinned deterministic calculation service and persisted plan snapshots.
- Frontend: dashboard plan creation/results and calculated warehouse fields.
- Migrations: plans, requirement snapshots, process version links.
- Tests: nested BOM, aggregation, available semi-finished stock, rounding, cycles defense.
- Dependencies: этапы 1–5.

Реализованный контракт этапа:

- производственный план создаётся только для продукта с активной версией техпроцесса и закрепляется за UUID этой версии; существующий план меняет версию только явной командой перерасчёта;
- расчёт рекурсивно раскрывает DAG, агрегирует повторяющиеся материалы, полуфабрикаты и операции и хранит результат отдельным снимком плана;
- свободный остаток вложенного полуфабриката уменьшает объём его собственного рецепта: материалы и операции нижнего уровня рассчитываются только на количество к изготовлению;
- несколько активных планов детерминированно распределяют складские остатки по дате создания; отмена или изменение плана пересчитывает снимки оставшихся активных планов;
- стоимость складывается из материалов и операций по сохранённым ценам, трудоёмкость — из норм времени; отсутствующие нормы/цены явно помечают расчёт как неполный;
- складские таблицы получают реальные поля `required`, `deficit` и `to produce`, операции — требуемое количество и время;
- frontend добавляет `/production-plans`: создание, сводку, фильтр статусов, карточки, подробные таблицы потребностей, перерасчёт по новой версии и отмену.

## 7. Production execution — реализовано

- Scope: atomic production record, component write-off, output receipt, plan progress.
- Backend: one transaction over inventory and plan; idempotency key.
- Frontend: register production feature and updated plan/stock states.
- Migrations: production records, idempotency and source references.
- Tests: success, insufficient stock rollback, replay, concurrency.
- Dependencies: этап 6.

Реализованный контракт этапа:

- выпуск регистрируется для продукта или требуемого планом полуфабриката и использует закреплённую в снимке версию техпроцесса;
- нормативные прямые компоненты рассчитываются по DAG: операции прозрачны для движения склада, а первый материал или полуфабрикат на обратном пути становится списываемым компонентом;
- создание записи, все списания, приход произведённой позиции, изменение прогресса и пересчёт активных планов выполняются одной транзакцией;
- отрицательный складской остаток блокирует проведение и откатывает даже уже выполненные внутри транзакции движения;
- `Idempotency-Key` имеет глобальную уникальность: повтор идентичной команды возвращает существующий результат, а повторное использование ключа с другим payload даёт конфликт;
- движения обоих ledger содержат nullable строгий FK `production_record_id`, сохраняя общие `source_type/source_id` для единого аудита;
- блокировка плана и складских сущностей защищает от параллельного перевыпуска и двойного списания; при полном выпуске план автоматически получает статус `completed`;
- frontend добавляет диалог регистрации продукта/полуфабриката, автоматическое обновление прогресса/остатков и лениво загружаемую историю производства.

## 8. Employee work + Payroll — реализовано

- Scope: work entries by count/time, historical rates, accruals, payments/allocation.
- Backend: work/payroll modules and FIFO/manual allocations.
- Frontend: expanded operation/employee tables, work/payment flows.
- Migrations: work entries, payments, allocations.
- Tests: historical prices, partial payments, edits/audit, decimal rules.
- Dependencies: этапы 3, 6–7.

Реализованный контракт этапа:

- выполненная работа фиксируется по количеству операций или по затраченным минутам; режим времени переводится в эквивалент операций через норму времени;
- ставка и норма времени сохраняются snapshot-полями записи: изменение справочника не пересчитывает прошлое, а редактирование неоплаченной записи использует исходные snapshot-значения;
- отсутствие ставки или нормы не мешает сохранить факт работы, но API и интерфейс явно показывают, почему автоматическое начисление недоступно;
- таблицы операций и сотрудников получают реальные агрегаты выполненного количества, начислений, выплат и остатка к оплате;
- выплата полностью распределяется по начислениям: по умолчанию от самой старой неоплаченной работы к новой (FIFO), при необходимости пользователь задаёт суммы вручную;
- переплата, распределение на чужую/удалённую/полностью оплаченную работу и распределение сверх остатка блокируются backend;
- оплаченная работа защищена от редактирования и удаления; неоплаченное удаление является audit-safe void с автором, временем и причиной;
- frontend добавляет запись работы, пагинированную историю с изменением/удалением, проведение выплаты, агрегаты по операциям и историю распределённых выплат.

## 9. Sales + Finance — реализовано

- Scope: sales with stock write-off, income/expense ledger, material/labour/sales aggregation.
- Backend: atomic sales and financial transaction modules.
- Frontend: sales/finance pages and period filters.
- Migrations: sales, financial transactions, historical price snapshots.
- Tests: insufficient stock, totals, rollback, permissions.
- Dependencies: этапы 2, 7–8.

Реализованный контракт этапа:

- продажа доступна только для неархивного изделия с признаком продукта и одной транзакцией создаёт неизменяемую запись продажи и отрицательное складское движение со строгим FK;
- блокировка строки продукта сериализует параллельные списания, а недостаточный остаток откатывает и продажу, и движение; `Idempotency-Key` защищает повтор команды;
- цена за единицу и итоговая сумма сохраняются в продаже как исторический snapshot и не зависят от последующих изменений данных;
- каждое новое движение материала фиксирует действующую цену единицы и рассчитанную стоимость; финансовый отчёт учитывает отрицательные движения и явно считает старые движения без цены неполными;
- единый финансовый read model объединяет доходы продаж, расходы материалов, фактические выплаты сотрудникам и ручные доходы/расходы без копирования источников истины;
- ручная финансовая операция неизменяема, содержит тип, сумму, дату, категорию, комментарий и автора;
- backend выполняет серверную фильтрацию периода/источника/направления, сортировку, пагинацию и агрегаты; операции записи ограничены ролями `admin/finance`, просмотр также доступен `manager`;
- frontend добавляет `/sales` и `/finance`, формы с подтверждением, фильтры периода/продукта/источника, агрегаты, состояния loading/empty/error и детализацию продажи.

## 10. Analytics — реализовано

- Scope: production, sales, stock and personnel metrics.
- Backend: indexed aggregate queries/read models.
- Frontend: period-based dashboards and Gravity charts/tables.
- Migrations: only measured indexes/materialized views when justified.
- Tests: aggregate fixtures, timezone boundaries, query budgets.
- Dependencies: этапы 6–9.

Реализованный контракт этапа:

- единый `GET /api/v1/analytics/dashboard` принимает обязательные границы периода и детализацию `day/week/month`, нормализует время в UTC и ограничивает диапазон десятью годами;
- производство агрегирует выпуск продуктов и полуфабрикатов, записи выпуска, планы, процент выполнения, операции и человеко-часы;
- продажи агрегируют количество, выручку, среднюю цену, текущий остаток готовых продуктов, временной ряд и top-20 продуктов;
- склад считает текущую стоимость материалов, позиции без цены, актуальный дефицит активных планов, приход/расход, востребованные материалы и дельты запасов;
- персонал показывает начислено/выплачено за период, текущую сумму к выплате, операции, человеко-часы и серверные срезы по сотрудникам/операциям;
- все метрики выполняются агрегатными PostgreSQL-запросами; детализации ограничены top-20, dashboard имеет фиксированный бюджет в 11 запросов без загрузки сырых журналов;
- миграция `0010` добавляет индексы дат для выпуска, складских движений, работ и выплат;
- frontend добавляет `/analytics`, пресеты «сегодня/неделя/месяц/квартал/год/свой период», KPI, адаптивные диаграммы, таблицы и состояния loading/empty/error.

## 11. Excel export — реализовано

- Scope: server-side `.xlsx` for filtered datasets and selected IDs.
- Backend: streaming export jobs preserving decimal/date cell types and labels.
- Frontend: export actions reusing current URL filters.
- Migrations: optional async job metadata.
- Tests: workbook schema/types/filter parity and large result behavior.
- Dependencies: corresponding tables from stages 1–10.

Реализованный контракт этапа:

- единый `GET /api/v1/exports/{dataset}.xlsx` формирует файл на backend для материалов, производимых позиций, складских движений, операций, выполненных работ, персонала, начислений, выплат, планов, выпуска, продаж, финансов и аналитики;
- выгрузка повторяет серверные фильтры, поиск, сортировку и период экранов, не зависит от текущей страницы пагинации и принимает повторяемый параметр `ids` для выбранных записей;
- UUID внешних связей заменяются названиями и другими человекочитаемыми значениями, а статусы и типы переводятся на русский язык;
- даты, дата-время, деньги и количества записываются настоящими Excel-ячейками с отдельными форматами; decimal-строки преобразуются без промежуточного JavaScript `number` и потери точности;
- заголовок закреплён, для всего диапазона включён автофильтр, ширина колонок задана по назначению; аналитика выгружается книгой из девяти тематических листов;
- генератор `.xlsx` работает без загрузки строк во frontend, текстовые значения безопасно сохраняются как inline strings, а сервер ограничивает одну выгрузку 100 000 строками;
- frontend показывает действия экспорта рядом с актуальными фильтрами основных страниц и внутри историй склада, работ и расчётов сотрудника;
- OpenAPI/TypeScript-контракт обновлён; интеграционные тесты проверяют все datasets, обход пагинации, фильтры/ID, структуру ZIP/XML и типы Excel-ячеек; изменение схемы БД не потребовалось.

## 12. Operation instructions + Markdown/images/public links/export

- Scope: draft/publish/version history, safe Markdown, images, public tokens/QR, md/txt/docx/pdf.
- Backend: instruction/media/publication/export modules, sanitization and expiring revocation.
- Frontend: editor/preview, operation and public responsive pages.
- Migrations: instruction/version/assets/public links and permission/audit data.
- Tests: XSS, publication isolation, link rotation/expiry, export fidelity, mobile E2E.
- Dependencies: этап 3 и production-ready authentication/RBAC.
