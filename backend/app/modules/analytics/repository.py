from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession


async def one(
    session: AsyncSession, statement: str, params: dict[str, Any]
) -> RowMapping:
    return (await session.execute(text(statement), params)).mappings().one()


async def many(
    session: AsyncSession, statement: str, params: dict[str, Any]
) -> list[RowMapping]:
    return list((await session.execute(text(statement), params)).mappings().all())


def period_params(
    date_from: datetime, date_to: datetime, bucket: str
) -> dict[str, Any]:
    return {"date_from": date_from, "date_to": date_to, "bucket": bucket}


async def production_overview(
    session: AsyncSession, *, date_from: datetime, date_to: datetime
) -> RowMapping:
    return await one(
        session,
        """
        WITH produced AS (
            SELECT
                COALESCE(SUM(pr.quantity) FILTER (WHERE mi.is_product), 0) products,
                COALESCE(SUM(pr.quantity) FILTER (WHERE NOT mi.is_product), 0) semi,
                COUNT(*) records
            FROM production_records pr
            JOIN manufactured_items mi ON mi.id = pr.item_id
            WHERE pr.created_at BETWEEN :date_from AND :date_to
        ), plan_metrics AS (
            SELECT
                COUNT(*) plans,
                COUNT(*) FILTER (WHERE status = 'completed') completed_plans,
                COALESCE(
                    SUM(produced_quantity) / NULLIF(SUM(planned_quantity), 0) * 100,
                    0
                ) completion_percent
            FROM production_plans
            WHERE created_at BETWEEN :date_from AND :date_to
              AND status <> 'cancelled'
        ), work AS (
            SELECT
                COALESCE(SUM(equivalent_quantity), 0) operations,
                COALESCE(SUM(time_minutes), 0) minutes
            FROM work_entries
            WHERE performed_at BETWEEN :date_from AND :date_to
              AND voided_at IS NULL
        )
        SELECT produced.products, produced.semi, produced.records,
               plan_metrics.plans, plan_metrics.completed_plans,
               plan_metrics.completion_percent, work.operations, work.minutes
        FROM produced CROSS JOIN plan_metrics CROSS JOIN work
        """,
        {"date_from": date_from, "date_to": date_to},
    )


async def production_dynamics(
    session: AsyncSession, *, date_from: datetime, date_to: datetime, bucket: str
) -> list[RowMapping]:
    return await many(
        session,
        """
        SELECT date_trunc(:bucket, pr.created_at) period_start,
               COALESCE(SUM(pr.quantity) FILTER (WHERE mi.is_product), 0) products,
               COALESCE(SUM(pr.quantity) FILTER (WHERE NOT mi.is_product), 0) semi
        FROM production_records pr
        JOIN manufactured_items mi ON mi.id = pr.item_id
        WHERE pr.created_at BETWEEN :date_from AND :date_to
        GROUP BY period_start
        ORDER BY period_start
        """,
        period_params(date_from, date_to, bucket),
    )


async def sales_overview(
    session: AsyncSession, *, date_from: datetime, date_to: datetime
) -> RowMapping:
    return await one(
        session,
        """
        WITH period_sales AS (
            SELECT COALESCE(SUM(quantity), 0) quantity,
                   COALESCE(SUM(total_amount), 0) revenue
            FROM sales
            WHERE sold_at BETWEEN :date_from AND :date_to
        ), product_stock AS (
            SELECT COALESCE(SUM(mim.quantity), 0) quantity
            FROM manufactured_item_movements mim
            JOIN manufactured_items mi ON mi.id = mim.manufactured_item_id
            WHERE mi.is_product
        )
        SELECT period_sales.quantity, period_sales.revenue,
               COALESCE(period_sales.revenue / NULLIF(period_sales.quantity, 0), 0)
                   average_price,
               product_stock.quantity current_stock
        FROM period_sales CROSS JOIN product_stock
        """,
        {"date_from": date_from, "date_to": date_to},
    )


async def sales_dynamics(
    session: AsyncSession, *, date_from: datetime, date_to: datetime, bucket: str
) -> list[RowMapping]:
    return await many(
        session,
        """
        SELECT date_trunc(:bucket, sold_at) period_start,
               SUM(quantity) quantity, SUM(total_amount) revenue
        FROM sales
        WHERE sold_at BETWEEN :date_from AND :date_to
        GROUP BY period_start
        ORDER BY period_start
        """,
        period_params(date_from, date_to, bucket),
    )


async def sales_by_product(
    session: AsyncSession, *, date_from: datetime, date_to: datetime
) -> list[RowMapping]:
    return await many(
        session,
        """
        WITH stock AS (
            SELECT manufactured_item_id, SUM(quantity) quantity
            FROM manufactured_item_movements
            GROUP BY manufactured_item_id
        )
        SELECT mi.id product_id, mi.name, mi.unit,
               SUM(s.quantity) quantity, SUM(s.total_amount) revenue,
               COALESCE(stock.quantity, 0) current_stock
        FROM sales s
        JOIN manufactured_items mi ON mi.id = s.product_id
        LEFT JOIN stock ON stock.manufactured_item_id = mi.id
        WHERE s.sold_at BETWEEN :date_from AND :date_to
        GROUP BY mi.id, mi.name, mi.unit, stock.quantity
        ORDER BY revenue DESC, mi.name
        LIMIT 20
        """,
        {"date_from": date_from, "date_to": date_to},
    )


async def warehouse_overview(
    session: AsyncSession, *, date_from: datetime, date_to: datetime
) -> RowMapping:
    return await one(
        session,
        """
        WITH balances AS (
            SELECT material_id, SUM(quantity) balance
            FROM inventory_movements
            GROUP BY material_id
        ), material_value AS (
            SELECT COALESCE(SUM(GREATEST(b.balance, 0) * m.price)
                            FILTER (WHERE m.price IS NOT NULL), 0) stock_value,
                   COUNT(*) FILTER (WHERE b.balance > 0 AND m.price IS NULL) unpriced
            FROM balances b
            JOIN materials m ON m.id = b.material_id
        ), requirements AS (
            SELECT r.material_id, SUM(r.required_quantity) required
            FROM production_plan_material_requirements r
            JOIN production_plans p ON p.id = r.plan_id
            WHERE p.status = 'active'
            GROUP BY r.material_id
        ), deficits AS (
            SELECT COUNT(*) FILTER (
                       WHERE GREATEST(r.required - COALESCE(b.balance, 0), 0) > 0
                   ) positions,
                   COALESCE(SUM(GREATEST(r.required - COALESCE(b.balance, 0), 0)), 0)
                       quantity
            FROM requirements r
            LEFT JOIN balances b ON b.material_id = r.material_id
        ), material_moves AS (
            SELECT COUNT(*) movements,
                   COALESCE(SUM(quantity) FILTER (WHERE quantity > 0), 0) inflow,
                   COALESCE(-SUM(quantity) FILTER (WHERE quantity < 0), 0) outflow
            FROM inventory_movements
            WHERE created_at BETWEEN :date_from AND :date_to
        ), semi_moves AS (
            SELECT COUNT(*) movements,
                   COALESCE(SUM(mim.quantity) FILTER (WHERE mim.quantity > 0), 0) inflow,
                   COALESCE(-SUM(mim.quantity) FILTER (WHERE mim.quantity < 0), 0) outflow
            FROM manufactured_item_movements mim
            JOIN manufactured_items mi ON mi.id = mim.manufactured_item_id
            WHERE NOT mi.is_product
              AND mim.created_at BETWEEN :date_from AND :date_to
        )
        SELECT material_value.stock_value, material_value.unpriced,
               deficits.positions deficit_positions, deficits.quantity deficit_quantity,
               material_moves.movements material_movements,
               material_moves.inflow material_inflow,
               material_moves.outflow material_outflow,
               semi_moves.movements semi_movements,
               semi_moves.inflow semi_inflow,
               semi_moves.outflow semi_outflow
        FROM material_value CROSS JOIN deficits
        CROSS JOIN material_moves CROSS JOIN semi_moves
        """,
        {"date_from": date_from, "date_to": date_to},
    )


async def demanded_materials(
    session: AsyncSession, *, date_from: datetime, date_to: datetime
) -> list[RowMapping]:
    return await many(
        session,
        """
        SELECT m.id material_id, m.name, m.unit, -SUM(im.quantity) consumed
        FROM inventory_movements im
        JOIN materials m ON m.id = im.material_id
        WHERE im.quantity < 0
          AND im.created_at BETWEEN :date_from AND :date_to
        GROUP BY m.id, m.name, m.unit
        ORDER BY consumed DESC, m.name
        LIMIT 10
        """,
        {"date_from": date_from, "date_to": date_to},
    )


async def stock_dynamics(
    session: AsyncSession, *, date_from: datetime, date_to: datetime, bucket: str
) -> list[RowMapping]:
    return await many(
        session,
        """
        WITH movement_buckets AS (
            SELECT date_trunc(:bucket, created_at) period_start,
                   SUM(quantity) materials, 0::numeric semi, 0::numeric products
            FROM inventory_movements
            WHERE created_at BETWEEN :date_from AND :date_to
            GROUP BY period_start
            UNION ALL
            SELECT date_trunc(:bucket, mim.created_at) period_start,
                   0::numeric materials,
                   COALESCE(SUM(mim.quantity) FILTER (WHERE NOT mi.is_product), 0) semi,
                   COALESCE(SUM(mim.quantity) FILTER (WHERE mi.is_product), 0) products
            FROM manufactured_item_movements mim
            JOIN manufactured_items mi ON mi.id = mim.manufactured_item_id
            WHERE mim.created_at BETWEEN :date_from AND :date_to
            GROUP BY period_start
        )
        SELECT period_start, SUM(materials) materials,
               SUM(semi) semi, SUM(products) products
        FROM movement_buckets
        GROUP BY period_start
        ORDER BY period_start
        """,
        period_params(date_from, date_to, bucket),
    )


async def personnel_overview(
    session: AsyncSession, *, date_from: datetime, date_to: datetime
) -> RowMapping:
    return await one(
        session,
        """
        WITH period_work AS (
            SELECT COALESCE(SUM(accrued_amount), 0) accrued,
                   COALESCE(SUM(equivalent_quantity), 0) operations,
                   COALESCE(SUM(time_minutes), 0) minutes
            FROM work_entries
            WHERE performed_at BETWEEN :date_from AND :date_to
              AND voided_at IS NULL
        ), period_payments AS (
            SELECT COALESCE(SUM(amount), 0) paid
            FROM employee_payments
            WHERE paid_at BETWEEN :date_from AND :date_to
        ), current_payable AS (
            SELECT GREATEST(
                       COALESCE((SELECT SUM(accrued_amount) FROM work_entries
                                 WHERE voided_at IS NULL), 0)
                       - COALESCE((SELECT SUM(amount) FROM payment_allocations), 0),
                       0
                   ) payable
        )
        SELECT period_work.accrued, period_payments.paid,
               current_payable.payable, period_work.operations, period_work.minutes
        FROM period_work CROSS JOIN period_payments CROSS JOIN current_payable
        """,
        {"date_from": date_from, "date_to": date_to},
    )


async def personnel_by_employee(
    session: AsyncSession, *, date_from: datetime, date_to: datetime
) -> list[RowMapping]:
    return await many(
        session,
        """
        WITH period_work AS (
            SELECT employee_id, COALESCE(SUM(accrued_amount), 0) accrued,
                   COALESCE(SUM(equivalent_quantity), 0) operations,
                   COALESCE(SUM(time_minutes), 0) minutes
            FROM work_entries
            WHERE performed_at BETWEEN :date_from AND :date_to
              AND voided_at IS NULL
            GROUP BY employee_id
        ), period_payments AS (
            SELECT employee_id, SUM(amount) paid
            FROM employee_payments
            WHERE paid_at BETWEEN :date_from AND :date_to
            GROUP BY employee_id
        ), current_accrual AS (
            SELECT employee_id, SUM(accrued_amount) accrued
            FROM work_entries
            WHERE voided_at IS NULL
            GROUP BY employee_id
        ), current_allocated AS (
            SELECT we.employee_id, SUM(pa.amount) allocated
            FROM payment_allocations pa
            JOIN work_entries we ON we.id = pa.work_entry_id
            GROUP BY we.employee_id
        ), activity AS (
            SELECT employee_id FROM period_work
            UNION
            SELECT employee_id FROM period_payments
        )
        SELECT e.id employee_id, e.full_name,
               COALESCE(pw.accrued, 0) accrued,
               COALESCE(pp.paid, 0) paid,
               GREATEST(COALESCE(ca.accrued, 0) - COALESCE(cl.allocated, 0), 0) payable,
               COALESCE(pw.operations, 0) operations,
               COALESCE(pw.minutes, 0) minutes
        FROM activity a
        JOIN employees e ON e.id = a.employee_id
        LEFT JOIN period_work pw ON pw.employee_id = e.id
        LEFT JOIN period_payments pp ON pp.employee_id = e.id
        LEFT JOIN current_accrual ca ON ca.employee_id = e.id
        LEFT JOIN current_allocated cl ON cl.employee_id = e.id
        ORDER BY accrued DESC, e.full_name
        LIMIT 20
        """,
        {"date_from": date_from, "date_to": date_to},
    )


async def personnel_by_operation(
    session: AsyncSession, *, date_from: datetime, date_to: datetime
) -> list[RowMapping]:
    return await many(
        session,
        """
        SELECT o.id operation_id, o.name,
               COALESCE(SUM(we.equivalent_quantity), 0) operations,
               COALESCE(SUM(we.time_minutes), 0) minutes,
               COALESCE(SUM(we.accrued_amount), 0) accrued
        FROM work_entries we
        JOIN operations o ON o.id = we.operation_id
        WHERE we.performed_at BETWEEN :date_from AND :date_to
          AND we.voided_at IS NULL
        GROUP BY o.id, o.name
        ORDER BY operations DESC, o.name
        LIMIT 20
        """,
        {"date_from": date_from, "date_to": date_to},
    )
