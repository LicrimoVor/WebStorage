import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.security import Actor, get_current_actor
from app.modules.payroll import service
from app.modules.payroll.schemas import (
    EmployeePayrollSummary,
    PaymentCreate,
    PaymentList,
    PaymentRead,
    WorkEntryCreate,
    WorkEntryList,
    WorkEntryRead,
    WorkEntryUpdate,
    WorkEntryVoid,
)

router = APIRouter(tags=["work and payroll"], responses={422: {"model": ProblemDetail}})
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


@router.post(
    "/operations/{operation_id}/work-entries",
    response_model=WorkEntryRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createWorkEntry",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def create_work_entry(
    operation_id: uuid.UUID,
    payload: WorkEntryCreate,
    session: Session,
    actor: ActorDependency,
) -> WorkEntryRead:
    return await service.create_work_entry(
        session,
        operation_id=operation_id,
        payload=payload,
        created_by=actor.subject,
    )


@router.get(
    "/operations/{operation_id}/work-entries",
    response_model=WorkEntryList,
    operation_id="listOperationWorkEntries",
    responses={404: {"model": ProblemDetail}},
)
async def list_operation_work_entries(
    operation_id: uuid.UUID,
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    include_voided: bool = False,
) -> WorkEntryList:
    return await service.list_work_entries(
        session,
        operation_id=operation_id,
        employee_id=None,
        include_voided=include_voided,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/employees/{employee_id}/work-entries",
    response_model=WorkEntryList,
    operation_id="listEmployeeWorkEntries",
    responses={404: {"model": ProblemDetail}},
)
async def list_employee_work_entries(
    employee_id: uuid.UUID,
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    include_voided: bool = False,
) -> WorkEntryList:
    return await service.list_work_entries(
        session,
        operation_id=None,
        employee_id=employee_id,
        include_voided=include_voided,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/work-entries/{work_entry_id}",
    response_model=WorkEntryRead,
    operation_id="getWorkEntry",
    responses={404: {"model": ProblemDetail}},
)
async def get_work_entry(work_entry_id: uuid.UUID, session: Session) -> WorkEntryRead:
    return await service.get_work_entry(session, work_entry_id)


@router.patch(
    "/work-entries/{work_entry_id}",
    response_model=WorkEntryRead,
    operation_id="updateWorkEntry",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def update_work_entry(
    work_entry_id: uuid.UUID, payload: WorkEntryUpdate, session: Session
) -> WorkEntryRead:
    return await service.update_work_entry(
        session, work_entry_id=work_entry_id, payload=payload
    )


@router.post(
    "/work-entries/{work_entry_id}/void",
    response_model=WorkEntryRead,
    operation_id="voidWorkEntry",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def void_work_entry(
    work_entry_id: uuid.UUID,
    payload: WorkEntryVoid,
    session: Session,
    actor: ActorDependency,
) -> WorkEntryRead:
    return await service.void_work_entry(
        session,
        work_entry_id=work_entry_id,
        payload=payload,
        voided_by=actor.subject,
    )


@router.post(
    "/employees/{employee_id}/payments",
    response_model=PaymentRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createEmployeePayment",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def create_employee_payment(
    employee_id: uuid.UUID,
    payload: PaymentCreate,
    session: Session,
    actor: ActorDependency,
) -> PaymentRead:
    return await service.create_payment(
        session,
        employee_id=employee_id,
        payload=payload,
        created_by=actor.subject,
    )


@router.get(
    "/employees/{employee_id}/payments",
    response_model=PaymentList,
    operation_id="listEmployeePayments",
    responses={404: {"model": ProblemDetail}},
)
async def list_employee_payments(
    employee_id: uuid.UUID,
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PaymentList:
    return await service.list_payments(
        session, employee_id=employee_id, page=page, page_size=page_size
    )


@router.get(
    "/employees/{employee_id}/payroll-summary",
    response_model=EmployeePayrollSummary,
    operation_id="getEmployeePayrollSummary",
    responses={404: {"model": ProblemDetail}},
)
async def get_employee_payroll_summary(
    employee_id: uuid.UUID, session: Session
) -> EmployeePayrollSummary:
    return await service.payroll_summary(session, employee_id)
