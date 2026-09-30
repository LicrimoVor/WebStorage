"""Defects are separate materials linked to a source material."""

import sqlalchemy as sa
from alembic import op

revision = "20260930_0026"
down_revision = "20260930_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("materials", sa.Column("source_material_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_materials_source_material_id_materials",
        "materials",
        "materials",
        ["source_material_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_materials_source_material_id", "materials", ["source_material_id"])


def downgrade() -> None:
    op.drop_index("ix_materials_source_material_id", table_name="materials")
    op.drop_constraint("fk_materials_source_material_id_materials", "materials", type_="foreignkey")
    op.drop_column("materials", "source_material_id")
