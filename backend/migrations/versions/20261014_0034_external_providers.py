"""External providers, semi-finished capabilities and per-unit costs."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261014_0034"
down_revision = "20261010_0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_providers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_external_providers")),
        sa.UniqueConstraint("name", name=op.f("uq_external_providers_name")),
    )
    op.create_index(
        "ux_external_providers_name_lower",
        "external_providers",
        [sa.text("lower(name)")],
        unique=True,
    )
    op.create_table(
        "external_offers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("provider_id", sa.UUID(), nullable=False),
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.Column("operation_id", sa.UUID(), nullable=False),
        sa.Column("money_cost", sa.Numeric(20, 2), server_default="0", nullable=False),
        sa.Column("materials", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["external_providers.id"],
            ondelete="RESTRICT",
            name=op.f("fk_external_offers_provider_id_external_providers"),
        ),
        sa.ForeignKeyConstraint(
            ["item_id"],
            ["manufactured_items.id"],
            ondelete="RESTRICT",
            name=op.f("fk_external_offers_item_id_manufactured_items"),
        ),
        sa.ForeignKeyConstraint(
            ["operation_id"],
            ["operations.id"],
            ondelete="RESTRICT",
            name=op.f("fk_external_offers_operation_id_operations"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_external_offers")),
        sa.UniqueConstraint("operation_id", name=op.f("uq_external_offers_operation_id")),
        sa.UniqueConstraint("provider_id", "item_id", name="uq_external_offers_provider_item"),
    )


def downgrade() -> None:
    op.drop_table("external_offers")
    op.drop_table("external_providers")
