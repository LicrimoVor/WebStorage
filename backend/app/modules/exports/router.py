import io
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.query import AvailabilityFilter, SortOrder
from app.core.security import Actor, Role, get_current_actor, require_any_role
from app.modules.exports import service
from app.modules.exports.schemas import ExportDataset, ExportFilters
from app.modules.finance.schemas import FinanceSource, FinancialDirection
from app.modules.manufactured_items.schemas import ManufacturedItemKind

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

router = APIRouter(
    prefix="/exports",
    tags=["exports"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


@router.get(
    "/{dataset}.xlsx",
    response_class=StreamingResponse,
    operation_id="exportDatasetToExcel",
    responses={
        200: {
            "content": {XLSX_MEDIA_TYPE: {}},
            "description": "Filtered Excel workbook",
        }
    },
)
async def export_dataset_to_excel(
    dataset: ExportDataset,
    session: Session,
    actor: ActorDependency,
    search: Annotated[str | None, Query(max_length=200)] = None,
    include_archived: bool = False,
    include_voided: bool = False,
    availability: AvailabilityFilter = AvailabilityFilter.ALL,
    deficit_only: bool = False,
    kind: ManufacturedItemKind = ManufacturedItemKind.ALL,
    plan_status: Annotated[str | None, Query(max_length=20)] = None,
    movement_type: Annotated[str | None, Query(max_length=24)] = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    material_id: uuid.UUID | None = None,
    product_id: uuid.UUID | None = None,
    employee_id: uuid.UUID | None = None,
    operation_id: uuid.UUID | None = None,
    plan_id: uuid.UUID | None = None,
    source: FinanceSource = FinanceSource.ALL,
    funding_source_id: uuid.UUID | None = None,
    direction: FinancialDirection | None = None,
    sort_by: Annotated[str | None, Query(max_length=40)] = None,
    sort_order: SortOrder = SortOrder.ASC,
    ids: Annotated[list[uuid.UUID] | None, Query()] = None,
) -> StreamingResponse:
    require_any_role(
        actor,
        Role.MANAGER,
        Role.FINANCE,
        Role.WAREHOUSE,
        Role.PRODUCTION,
    )
    if dataset == ExportDataset.FINANCE_ENTRIES:
        require_any_role(actor, Role.FINANCE, Role.MANAGER)
    if dataset == ExportDataset.PROCUREMENT:
        require_any_role(actor, Role.WAREHOUSE, Role.MANAGER, Role.FINANCE)
    result = await service.create_export(
        session,
        dataset=dataset,
        filters=ExportFilters(
            search=search,
            include_archived=include_archived,
            include_voided=include_voided,
            availability=availability,
            deficit_only=deficit_only,
            kind=kind,
            status=plan_status,
            movement_type=movement_type,
            date_from=date_from,
            date_to=date_to,
            material_id=material_id,
            product_id=product_id,
            employee_id=employee_id,
            operation_id=operation_id,
            plan_id=plan_id,
            source=source,
            funding_source_id=funding_source_id,
            direction=direction,
            sort_by=sort_by,
            sort_order=sort_order,
            ids=ids,
        ),
    )
    return StreamingResponse(
        io.BytesIO(result.content),
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{result.filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )
