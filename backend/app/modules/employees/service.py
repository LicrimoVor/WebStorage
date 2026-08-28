import math
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.query import SortOrder
from app.modules.employees import repository
from app.modules.employees.model import Employee
from app.modules.employees.schemas import (
    EmployeeCreate,
    EmployeeList,
    EmployeeRead,
    EmployeeSortField,
    EmployeeUpdate,
)


def to_read_model(employee: Employee) -> EmployeeRead:
    return EmployeeRead(
        id=employee.id,
        full_name=employee.full_name,
        active=employee.active,
        comment=employee.comment,
        accrued_total=Decimal("0"),
        paid_total=Decimal("0"),
        payable_total=Decimal("0"),
        completed_operations=Decimal("0"),
        created_at=employee.created_at,
        updated_at=employee.updated_at,
    )


async def create(session: AsyncSession, payload: EmployeeCreate) -> EmployeeRead:
    employee = Employee(**payload.model_dump())
    await repository.create_employee(session, employee)
    await session.commit()
    await session.refresh(employee)
    return to_read_model(employee)


async def list_all(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    include_inactive: bool,
    sort_by: EmployeeSortField,
    sort_order: SortOrder,
) -> EmployeeList:
    items, total = await repository.list_employees(
        session,
        page=page,
        page_size=page_size,
        search=search,
        include_inactive=include_inactive,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return EmployeeList(
        items=[to_read_model(item) for item in items],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def get(session: AsyncSession, employee_id: uuid.UUID) -> EmployeeRead:
    employee = await repository.get_employee(session, employee_id)
    if employee is None:
        raise NotFoundError("Employee was not found")
    return to_read_model(employee)


async def update(
    session: AsyncSession, employee_id: uuid.UUID, payload: EmployeeUpdate
) -> EmployeeRead:
    employee = await repository.get_employee(session, employee_id, for_update=True)
    if employee is None:
        raise NotFoundError("Employee was not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(employee, field, value)
    await session.commit()
    await session.refresh(employee)
    return to_read_model(employee)


async def archive(session: AsyncSession, employee_id: uuid.UUID) -> EmployeeRead:
    employee = await repository.get_employee(session, employee_id, for_update=True)
    if employee is None:
        raise NotFoundError("Employee was not found")
    employee.active = False
    await session.commit()
    await session.refresh(employee)
    return to_read_model(employee)
