"""Allow material names in separate groups; service serializes scoped validation."""

import sqlalchemy as sa
from alembic import op

revision = "20260929_0021"
down_revision = "20260929_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_materials_name_lower", table_name="materials")
    op.create_index("ix_materials_name_lower", "materials", [sa.text("lower(name)")])


def downgrade() -> None:
    # Downgrade fails transactionally if names now repeat across groups.
    op.drop_index("ix_materials_name_lower", table_name="materials")
    op.create_index(
        "ix_materials_name_lower", "materials", [sa.text("lower(name)")], unique=True,
    )
