import asyncio
from logging.config import fileConfig

from alembic import context
from app.core.config import get_settings
from app.core.database import Base
from app.modules.audit.model import AuditEvent  # noqa: F401
from app.modules.auth.model import AuthSession, UserAccount  # noqa: F401
from app.modules.business.model import BusinessDocument, FundingSource, ProductUnit  # noqa: F401
from app.modules.employees.model import Employee  # noqa: F401
from app.modules.finance.model import FinancialTransaction  # noqa: F401
from app.modules.inventory.model import InventoryMovement  # noqa: F401
from app.modules.manufactured_items.model import (  # noqa: F401
    ManufacturedItem,
    ManufacturedItemMovement,
)
from app.modules.materials.model import Material  # noqa: F401
from app.modules.operation_instructions.model import (  # noqa: F401
    OperationInstruction,
    OperationInstructionAsset,
    OperationInstructionPublicLink,
    OperationInstructionVersion,
)
from app.modules.operations.model import Operation  # noqa: F401
from app.modules.payroll.model import (  # noqa: F401
    EmployeePayment,
    PaymentAllocation,
    WorkEntry,
)
from app.modules.production.model import ProductionRecord  # noqa: F401
from app.modules.production_plans.model import (  # noqa: F401
    ProductionPlan,
    ProductionPlanItemRequirement,
    ProductionPlanMaterialRequirement,
    ProductionPlanOperationRequirement,
)
from app.modules.sales.model import Sale  # noqa: F401
from app.modules.technological_processes.model import (  # noqa: F401
    TechnologicalProcess,
    TechnologicalProcessEdge,
    TechnologicalProcessNode,
    TechnologicalProcessVersion,
)
from app.modules.warehouse.model import (  # noqa: F401
    InventoryGroup,
    InventoryGroupManufacturedItem,
    InventoryGroupMaterial,
    StockRevision,
    StockRevisionEntry,
)
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: object) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
