import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainValidationError
from app.modules.analytics import service as analytics_service
from app.modules.analytics.schemas import AnalyticsBucket, AnalyticsDashboardRead
from app.modules.exports import repository
from app.modules.exports.schemas import ExportDataset, ExportFilters
from app.modules.exports.workbook import (
    CellKind,
    ExportColumn,
    ExportSheet,
    build_workbook,
)
from app.modules.procurement.service import export_rows as procurement_rows


@dataclass(frozen=True, slots=True)
class ExportResult:
    filename: str
    content: bytes


TEXT = CellKind.TEXT
QUANTITY = CellKind.QUANTITY
MONEY = CellKind.MONEY
DATE = CellKind.DATE
DATETIME = CellKind.DATETIME
NUMBER = CellKind.NUMBER


DATASET_COLUMNS: dict[ExportDataset, tuple[str, list[ExportColumn]]] = {
    ExportDataset.MATERIALS: (
        "Материалы",
        [
            ExportColumn("name", "Материал", width=30),
            ExportColumn("unit", "Единица", width=12),
            ExportColumn("free_quantity", "Свободно", QUANTITY),
            ExportColumn("required_quantity", "Требуется", QUANTITY),
            ExportColumn("deficit_quantity", "Дефицит", QUANTITY),
            ExportColumn("price", "Цена", MONEY),
            ExportColumn("url", "Ссылка", width=35),
            ExportColumn("archived", "Статус", width=14),
            ExportColumn("created_at", "Создан", DATETIME),
        ],
    ),
    ExportDataset.MANUFACTURED_ITEMS: (
        "Производимые позиции",
        [
            ExportColumn("kind", "Тип", width=18),
            ExportColumn("name", "Наименование", width=30),
            ExportColumn("unit", "Единица", width=12),
            ExportColumn("free_quantity", "Свободно", QUANTITY),
            ExportColumn("required_quantity", "Требуется", QUANTITY),
            ExportColumn("to_produce_quantity", "К производству", QUANTITY),  # noqa: RUF001
            ExportColumn("archived", "Статус", width=14),
            ExportColumn("created_at", "Создан", DATETIME),
        ],
    ),
    ExportDataset.INVENTORY_MOVEMENTS: (
        "Складские движения",
        [
            ExportColumn("created_at", "Дата", DATETIME),
            ExportColumn("kind", "Тип позиции", width=18),
            ExportColumn("name", "Позиция", width=30),
            ExportColumn("movement_type", "Тип движения", width=20),
            ExportColumn("quantity", "Количество", QUANTITY),
            ExportColumn("unit", "Единица", width=12),
            ExportColumn("balance_before", "Остаток до", QUANTITY),
            ExportColumn("balance_after", "Остаток после", QUANTITY),
            ExportColumn("unit_price", "Цена", MONEY),
            ExportColumn("total_amount", "Стоимость", MONEY),
            ExportColumn("comment", "Комментарий", width=35),
        ],
    ),
    ExportDataset.OPERATIONS: (
        "Операции",
        [
            ExportColumn("name", "Операция", width=30),
            ExportColumn("time_norm", "Норма, мин", QUANTITY),
            ExportColumn("price_per_operation", "Ставка", MONEY),
            ExportColumn("required_quantity", "Требуется", QUANTITY),
            ExportColumn("required_time_minutes", "Требуется, мин", QUANTITY),
            ExportColumn("completed_quantity", "Выполнено", QUANTITY),
            ExportColumn("archived", "Статус", width=14),
            ExportColumn("created_at", "Создана", DATETIME),
        ],
    ),
    ExportDataset.WORK_ENTRIES: (
        "Выполненные операции",
        [
            ExportColumn("performed_at", "Дата", DATETIME),
            ExportColumn("employee", "Сотрудник", width=30),
            ExportColumn("operation", "Операция", width=30),
            ExportColumn("input_mode", "Способ учёта", width=18),
            ExportColumn("input_value", "Введено", QUANTITY),
            ExportColumn("equivalent_quantity", "Операций", QUANTITY),
            ExportColumn("time_minutes", "Минут", QUANTITY),
            ExportColumn("comment", "Комментарий", width=35),
            ExportColumn("voided_at", "Аннулирована", DATETIME),
        ],
    ),
    ExportDataset.EMPLOYEES: (
        "Персонал",
        [
            ExportColumn("full_name", "Сотрудник", width=32),
            ExportColumn("compensation_type", "Тип оплаты", width=18),
            ExportColumn("hourly_rate", "Ставка в час", MONEY),
            ExportColumn("active", "Статус", width=14),
            ExportColumn("completed_operations", "Операций", QUANTITY),
            ExportColumn(
                "paid_operations_equivalent", "Оплачено, экв.", QUANTITY
            ),
            ExportColumn("accrued", "Начислено", MONEY),
            ExportColumn("paid", "Выплачено", MONEY),
            ExportColumn("payable", "К выплате", MONEY),  # noqa: RUF001
            ExportColumn("comment", "Комментарий", width=35),
            ExportColumn("created_at", "Создан", DATETIME),
        ],
    ),
    ExportDataset.PAYROLL_ACCRUALS: (
        "Начисления",
        [
            ExportColumn("performed_at", "Дата", DATETIME),
            ExportColumn("employee", "Сотрудник", width=30),
            ExportColumn("operation", "Операция", width=30),
            ExportColumn("equivalent_quantity", "Операций", QUANTITY),
            ExportColumn("time_minutes", "Минут", QUANTITY),
            ExportColumn("rate", "Ставка", MONEY),
            ExportColumn("accrued", "Начислено", MONEY),
            ExportColumn("paid", "Оплачено", MONEY),
            ExportColumn("payable", "Остаток", MONEY),
        ],
    ),
    ExportDataset.EMPLOYEE_PAYMENTS: (
        "Выплаты",
        [
            ExportColumn("paid_at", "Дата", DATETIME),
            ExportColumn("employee", "Сотрудник", width=30),
            ExportColumn("amount", "Сумма", MONEY),
            ExportColumn("allocation_mode", "Распределение", width=18),
            ExportColumn("comment", "Комментарий", width=35),
            ExportColumn("created_by", "Автор", width=24),
        ],
    ),
    ExportDataset.PRODUCTION_PLANS: (
        "Производственные планы",
        [
            ExportColumn("created_at", "Создан", DATETIME),
            ExportColumn("product", "Продукт", width=30),
            ExportColumn("planned_quantity", "Запланировано", QUANTITY),
            ExportColumn("produced_quantity", "Произведено", QUANTITY),
            ExportColumn("remaining_quantity", "Осталось", QUANTITY),
            ExportColumn("unit", "Единица", width=12),
            ExportColumn("status", "Статус", width=16),
            ExportColumn("target_date", "Плановая дата", DATE),
            ExportColumn("required_minutes", "Трудоёмкость, мин", QUANTITY),
            ExportColumn("estimated_cost", "Расчётная стоимость", MONEY),
            ExportColumn("calculation_complete", "Расчёт", width=14),
            ExportColumn("created_by", "Автор", width=24),
        ],
    ),
    ExportDataset.PRODUCTION_RECORDS: (
        "Производство",
        [
            ExportColumn("created_at", "Дата", DATETIME),
            ExportColumn("plan_product", "Продукт плана", width=30),
            ExportColumn("produced_item", "Произведено", width=30),
            ExportColumn("quantity", "Количество", QUANTITY),
            ExportColumn("unit", "Единица", width=12),
            ExportColumn("process_version", "Версия техпроцесса", NUMBER),
            ExportColumn("comment", "Комментарий", width=35),
            ExportColumn("created_by", "Автор", width=24),
        ],
    ),
    ExportDataset.SALES: (
        "Продажи",
        [
            ExportColumn("sold_at", "Дата", DATETIME),
            ExportColumn("product", "Продукт", width=30),
            ExportColumn("quantity", "Количество", QUANTITY),
            ExportColumn("unit", "Единица", width=12),
            ExportColumn("unit_price", "Цена", MONEY),
            ExportColumn("total_amount", "Сумма", MONEY),
            ExportColumn("comment", "Комментарий", width=35),
            ExportColumn("created_by", "Автор", width=24),
        ],
    ),
    ExportDataset.FINANCE_ENTRIES: (
        "Финансовые операции",
        [
            ExportColumn("occurred_at", "Дата", DATETIME),
            ExportColumn("source_type", "Источник", width=20),
            ExportColumn("direction", "Направление", width=14),
            ExportColumn("category", "Категория", width=24),
            ExportColumn("description", "Описание", width=32),
            ExportColumn("amount", "Сумма", MONEY),
            ExportColumn("comment", "Комментарий", width=35),
            ExportColumn("created_by", "Автор", width=24),
        ],
    ),
}


VALUE_LABELS: dict[str, dict[object, str]] = {
    "archived": {True: "Архив", False: "Активен"},
    "active": {True: "Активен", False: "Неактивен"},
    "compensation_type": {"piecework": "Сдельная", "hourly": "Почасовая"},
    "calculation_complete": {True: "Полный", False: "Неполный"},
    "movement_type": {
        "receipt": "Приход",
        "consumption": "Расход",
        "production": "Производство",
        "sale": "Продажа",
        "adjustment": "Корректировка",
        "write_off": "Списание",
    },
    "input_mode": {"quantity": "Количество", "time": "Время"},
    "allocation_mode": {"fifo": "FIFO", "manual": "Вручную"},
    "status": {
        "draft": "Черновик",
        "active": "Активен",
        "completed": "Завершён",
        "cancelled": "Отменён",
    },
    "source_type": {
        "sale": "Продажа",
        "material": "Материалы",
        "labour": "Оплата труда",
        "manual": "Вручную",
    },
    "direction": {"income": "Доход", "expense": "Расход"},
}


def normalize_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def readable_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for row in rows:
        readable = dict(row)
        for key, labels in VALUE_LABELS.items():
            if key in readable and readable[key] in labels:
                readable[key] = labels[readable[key]]
        result.append(readable)
    return result


def filename(dataset: ExportDataset, filters: ExportFilters) -> str:
    suffix = datetime.now(UTC).date().isoformat()
    if filters.date_from is not None and filters.date_to is not None:
        suffix = f"{filters.date_from.date().isoformat()}_{filters.date_to.date().isoformat()}"
    return f"{dataset.value}_{suffix}.xlsx"


def analytics_bucket(date_from: datetime, date_to: datetime) -> AnalyticsBucket:
    days = (date_to - date_from).days
    if days <= 92:
        return AnalyticsBucket.DAY
    if days <= 730:
        return AnalyticsBucket.WEEK
    return AnalyticsBucket.MONTH


def model_rows(items: list[Any]) -> list[dict[str, Any]]:
    return [item.model_dump() for item in items]


def analytics_sheets(dashboard: AnalyticsDashboardRead) -> list[ExportSheet]:
    production_summary = dashboard.production.model_dump(exclude={"dynamics"})
    sales_summary = dashboard.sales.model_dump(exclude={"dynamics", "by_product"})
    warehouse_summary = dashboard.warehouse.model_dump(
        exclude={"demanded_materials", "dynamics"}
    )
    personnel_summary = dashboard.personnel.model_dump(
        exclude={"by_employee", "by_operation"}
    )
    return [
        ExportSheet(
            "Производство — итоги",
            [
                ExportColumn("produced_products", "Продукты", QUANTITY),
                ExportColumn("produced_semi_finished", "Полуфабрикаты", QUANTITY),
                ExportColumn("production_records", "Записи выпуска", NUMBER),
                ExportColumn("plans", "Планы", NUMBER),
                ExportColumn("completed_plans", "Завершено планов", NUMBER),
                ExportColumn("plan_completion_percent", "Выполнение, %", QUANTITY),
                ExportColumn("completed_operations", "Операции", QUANTITY),
                ExportColumn("person_hours", "Человеко-часы", QUANTITY),
            ],
            [production_summary],
        ),
        ExportSheet(
            "Динамика производства",
            [
                ExportColumn("period_start", "Период", DATETIME),
                ExportColumn("products_quantity", "Продукты", QUANTITY),
                ExportColumn("semi_finished_quantity", "Полуфабрикаты", QUANTITY),
            ],
            model_rows(dashboard.production.dynamics),
        ),
        ExportSheet(
            "Продажи — итоги",
            [
                ExportColumn("sold_quantity", "Продано", QUANTITY),
                ExportColumn("revenue", "Выручка", MONEY),
                ExportColumn("average_unit_price", "Средняя цена", MONEY),
                ExportColumn("current_product_stock", "Остаток продуктов", QUANTITY),
            ],
            [sales_summary],
        ),
        ExportSheet(
            "Продажи по продуктам",
            [
                ExportColumn("name", "Продукт", width=30),
                ExportColumn("quantity", "Продано", QUANTITY),
                ExportColumn("unit", "Единица", width=12),
                ExportColumn("revenue", "Выручка", MONEY),
                ExportColumn("current_stock", "Остаток", QUANTITY),
            ],
            model_rows(dashboard.sales.by_product),
        ),
        ExportSheet(
            "Склад — итоги",
            [
                ExportColumn("current_material_stock_value", "Стоимость материалов", MONEY),
                ExportColumn("unpriced_material_positions", "Без цены", NUMBER),
                ExportColumn("material_deficit_positions", "Дефицитных позиций", NUMBER),
                ExportColumn("material_deficit_quantity", "Дефицит", QUANTITY),
                ExportColumn("material_inflow", "Приход материалов", QUANTITY),
                ExportColumn("material_outflow", "Расход материалов", QUANTITY),
                ExportColumn("semi_finished_inflow", "Приход полуфабрикатов", QUANTITY),
                ExportColumn("semi_finished_outflow", "Расход полуфабрикатов", QUANTITY),
            ],
            [warehouse_summary],
        ),
        ExportSheet(
            "Востребованные материалы",
            [
                ExportColumn("name", "Материал", width=30),
                ExportColumn("consumed_quantity", "Израсходовано", QUANTITY),
                ExportColumn("unit", "Единица", width=12),
            ],
            model_rows(dashboard.warehouse.demanded_materials),
        ),
        ExportSheet(
            "Персонал — итоги",
            [
                ExportColumn("accrued", "Начислено", MONEY),
                ExportColumn("paid", "Выплачено", MONEY),
                ExportColumn("payable_current", "К выплате", MONEY),  # noqa: RUF001
                ExportColumn("completed_operations", "Операции", QUANTITY),
                ExportColumn("person_hours", "Человеко-часы", QUANTITY),
            ],
            [personnel_summary],
        ),
        ExportSheet(
            "По сотрудникам",
            [
                ExportColumn("full_name", "Сотрудник", width=30),
                ExportColumn("completed_operations", "Операции", QUANTITY),
                ExportColumn("person_hours", "Человеко-часы", QUANTITY),
                ExportColumn("accrued", "Начислено", MONEY),
                ExportColumn("paid", "Выплачено", MONEY),
                ExportColumn("payable_current", "К выплате", MONEY),  # noqa: RUF001
            ],
            model_rows(dashboard.personnel.by_employee),
        ),
        ExportSheet(
            "По операциям",
            [
                ExportColumn("name", "Операция", width=30),
                ExportColumn("completed_operations", "Выполнено", QUANTITY),
                ExportColumn("person_hours", "Человеко-часы", QUANTITY),
                ExportColumn("accrued", "Начислено", MONEY),
            ],
            model_rows(dashboard.personnel.by_operation),
        ),
    ]


async def create_export(
    session: AsyncSession,
    *,
    dataset: ExportDataset,
    filters: ExportFilters,
) -> ExportResult:
    date_from = normalize_timestamp(filters.date_from)
    date_to = normalize_timestamp(filters.date_to)
    if date_from is not None and date_to is not None and date_from > date_to:
        raise DomainValidationError("date_from must not be after date_to")
    filters = filters.model_copy(update={"date_from": date_from, "date_to": date_to})

    if dataset == ExportDataset.PROCUREMENT:
        rows_to_buy = await procurement_rows(session, filters.search)
        columns = [
            ExportColumn("name", "Материал", width=35),
            ExportColumn("unit", "Единица", width=12),
            ExportColumn("required_quantity", "Потребность", QUANTITY),
            ExportColumn("stock_quantity", "Остаток", QUANTITY),
            ExportColumn("purchase_quantity", "К закупке", QUANTITY),  # noqa: RUF001
            ExportColumn("unit_price", "Цена", MONEY),
            ExportColumn("estimated_cost", "Сумма", MONEY),
            ExportColumn("target_date", "Срок плана", DATE),
            ExportColumn("active_plans", "Активных планов", NUMBER),
            ExportColumn("url", "Ссылка", width=40),
            ExportColumn("archived", "В архиве"),  # noqa: RUF001
        ]
        for row in rows_to_buy:
            row["archived"] = "Да" if row["archived"] else "Нет"
        return ExportResult(
            filename=f"procurement_{datetime.now(UTC):%Y%m%d_%H%M%S}.xlsx",
            content=await asyncio.to_thread(
                build_workbook, [ExportSheet("Закупки по дефициту", columns, rows_to_buy)],
            ),
        )

    if dataset == ExportDataset.ANALYTICS:
        now = datetime.now(UTC)
        analytics_from = date_from or now.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        analytics_to = date_to or now
        dashboard = await analytics_service.get_dashboard(
            session,
            date_from=analytics_from,
            date_to=analytics_to,
            bucket=analytics_bucket(analytics_from, analytics_to),
        )
        sheets = analytics_sheets(dashboard)
        effective_filters = filters.model_copy(
            update={"date_from": analytics_from, "date_to": analytics_to}
        )
        return ExportResult(
            filename=filename(dataset, effective_filters),
            content=build_workbook(sheets),
        )

    rows = readable_rows(await repository.rows_for_dataset(session, dataset, filters))
    sheet_name, columns = DATASET_COLUMNS[dataset]
    return ExportResult(
        filename=filename(dataset, filters),
        content=build_workbook([ExportSheet(sheet_name, columns, rows)]),
    )
