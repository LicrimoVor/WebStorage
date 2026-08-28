import uuid

from sqlalchemy import asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.query import SortOrder
from app.modules.employees.model import Employee
from app.modules.employees.schemas import EmployeeSortField


async def list_employees(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    include_inactive: bool,
    sort_by: EmployeeSortField,
    sort_order: SortOrder,
) -> tuple[list[Employee], int]:
    statement = select(Employee)
    if not include_inactive:
        statement = statement.where(Employee.active.is_(True))
    if search:
        statement = statement.where(Employee.full_name.ilike(f"%{search.strip()}%"))
    total = int(
        (
            await session.execute(
                select(func.count()).select_from(statement.order_by(None).subquery())
            )
        ).scalar_one()
    )
    order_columns = {
        EmployeeSortField.FULL_NAME: func.lower(Employee.full_name),
        EmployeeSortField.CREATED_AT: Employee.created_at,
    }
    direction = asc if sort_order == SortOrder.ASC else desc
    statement = statement.order_by(direction(order_columns[sort_by]), asc(Employee.id))
    statement = statement.offset((page - 1) * page_size).limit(page_size)
    return list((await session.execute(statement)).scalars().all()), total


async def get_employee(
    session: AsyncSession, employee_id: uuid.UUID, *, for_update: bool = False
) -> Employee | None:
    statement = select(Employee).where(Employee.id == employee_id)
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def create_employee(session: AsyncSession, employee: Employee) -> Employee:
    session.add(employee)
    await session.flush()
    return employee
