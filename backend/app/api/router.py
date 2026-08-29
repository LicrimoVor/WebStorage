from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import Actor, get_current_actor
from app.modules.analytics.router import router as analytics_router
from app.modules.employees.router import router as employees_router
from app.modules.exports.router import router as exports_router
from app.modules.finance.router import router as finance_router
from app.modules.inventory.router import router as inventory_router
from app.modules.manufactured_items.router import router as manufactured_items_router
from app.modules.materials.router import router as materials_router
from app.modules.media.router import router as media_router
from app.modules.operations.router import router as operations_router
from app.modules.payroll.router import router as payroll_router
from app.modules.production.router import router as production_router
from app.modules.production_plans.router import router as production_plans_router
from app.modules.sales.router import router as sales_router
from app.modules.technological_processes.router import (
    router as technological_processes_router,
)

api_router = APIRouter(dependencies=[Depends(get_current_actor)])
api_router.include_router(materials_router)
api_router.include_router(media_router)
api_router.include_router(inventory_router)
api_router.include_router(manufactured_items_router)
api_router.include_router(operations_router)
api_router.include_router(employees_router)
api_router.include_router(technological_processes_router)
api_router.include_router(production_plans_router)
api_router.include_router(production_router)
api_router.include_router(payroll_router)
api_router.include_router(sales_router)
api_router.include_router(finance_router)
api_router.include_router(analytics_router)
api_router.include_router(exports_router)
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


@api_router.get("/me", tags=["system"], operation_id="getCurrentActor")
async def get_me(actor: ActorDependency) -> dict[str, object]:
    return {"subject": actor.subject, "roles": sorted(actor.roles)}
