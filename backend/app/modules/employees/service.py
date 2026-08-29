import math
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainValidationError, NotFoundError
from app.core.query import SortOrder
from app.modules.employees import repository
from app.modules.employees.model import Employee
from app.modules.employees.schemas import (
    EmployeeCompensationType,
    EmployeeCreate,
    EmployeeList,
    EmployeeRead,
    EmployeeSortField,
    EmployeeUpdate,
)
from app.modules.payroll import repository as payroll_repository


def to_read_model(
    employee: Employee,
    totals: tuple[Decimal, Decimal, Decimal, Decimal] = (
        Decimal("0"),
        Decimal("0"),
        Decimal("0"),
        Decimal("0"),
    ),
) -> EmployeeRead:
    accrued, paid, completed, paid_equivalent = totals
    return EmployeeRead(
        id=employee.id,
        full_name=employee.full_name,
        active=employee.active,
        compensation_type=employee.compensation_type,
        hourly_rate=employee.hourly_rate,
        comment=employee.comment,
        accrued_total=accrued,
        paid_total=paid,
        payable_total=max(accrued - paid, Decimal("0")),
        completed_operations=completed,
        paid_operations_equivalent=paid_equivalent,
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
    totals = await payroll_repository.employee_totals(
        session, [employee.id for employee in items]
    )
    return EmployeeList(
        items=[
            to_read_model(item, totals.get(item.id, (Decimal("0"),) * 4))
            for item in items
        ],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def get(session: AsyncSession, employee_id: uuid.UUID) -> EmployeeRead:
    employee = await repository.get_employee(session, employee_id)
    if employee is None:
        raise NotFoundError("Employee was not found")
    totals = await payroll_repository.employee_totals(session, [employee.id])
    return to_read_model(employee, totals.get(employee.id, (Decimal("0"),) * 4))


async def update(
    session: AsyncSession, employee_id: uuid.UUID, payload: EmployeeUpdate
) -> EmployeeRead:
    employee = await repository.get_employee(session, employee_id, for_update=True)
    if employee is None:
        raise NotFoundError("Employee was not found")
    changes = payload.model_dump(exclude_unset=True)
    next_type = changes.get("compensation_type", employee.compensation_type)
    next_rate = changes.get("hourly_rate", employee.hourly_rate)
    if next_type == EmployeeCompensationType.HOURLY and next_rate is None:
        raise DomainValidationError("An hourly employee must have an hourly rate")
    if next_type == EmployeeCompensationType.PIECEWORK:
        changes["hourly_rate"] = None
    for field, value in changes.items():
        setattr(employee, field, value)
    await session.commit()
    await session.refresh(employee)
    totals = await payroll_repository.employee_totals(session, [employee.id])
    return to_read_model(employee, totals.get(employee.id, (Decimal("0"),) * 4))


async def archive(session: AsyncSession, employee_id: uuid.UUID) -> EmployeeRead:
    employee = await repository.get_employee(session, employee_id, for_update=True)
    if employee is None:
        raise NotFoundError("Employee was not found")
    employee.active = False
    await session.commit()
    await session.refresh(employee)
    totals = await payroll_repository.employee_totals(session, [employee.id])
    return to_read_model(employee, totals.get(employee.id, (Decimal("0"),) * 4))
