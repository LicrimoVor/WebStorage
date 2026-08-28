import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.query import SortOrder
from app.modules.employees import service
from app.modules.employees.schemas import (
    EmployeeCreate,
    EmployeeList,
    EmployeeRead,
    EmployeeSortField,
    EmployeeUpdate,
)

router = APIRouter(
    prefix="/employees",
    tags=["employees"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]


@router.post(
    "",
    response_model=EmployeeRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createEmployee",
)
async def create_employee(payload: EmployeeCreate, session: Session) -> EmployeeRead:
    return await service.create(session, payload)


@router.get("", response_model=EmployeeList, operation_id="listEmployees")
async def list_employees(
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query(max_length=200)] = None,
    include_inactive: bool = False,
    sort_by: EmployeeSortField = EmployeeSortField.FULL_NAME,
    sort_order: SortOrder = SortOrder.ASC,
) -> EmployeeList:
    return await service.list_all(
        session,
        page=page,
        page_size=page_size,
        search=search,
        include_inactive=include_inactive,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get(
    "/{employee_id}",
    response_model=EmployeeRead,
    operation_id="getEmployee",
    responses={404: {"model": ProblemDetail}},
)
async def get_employee(employee_id: uuid.UUID, session: Session) -> EmployeeRead:
    return await service.get(session, employee_id)


@router.patch(
    "/{employee_id}",
    response_model=EmployeeRead,
    operation_id="updateEmployee",
    responses={404: {"model": ProblemDetail}},
)
async def update_employee(
    employee_id: uuid.UUID, payload: EmployeeUpdate, session: Session
) -> EmployeeRead:
    return await service.update(session, employee_id, payload)


@router.post(
    "/{employee_id}/archive",
    response_model=EmployeeRead,
    operation_id="archiveEmployee",
    responses={404: {"model": ProblemDetail}},
)
async def archive_employee(employee_id: uuid.UUID, session: Session) -> EmployeeRead:
    return await service.archive(session, employee_id)
