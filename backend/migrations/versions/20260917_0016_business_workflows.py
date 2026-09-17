"""Funding sources, receipts, repairs, product units and inventory hierarchy."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260917_0016"
down_revision = "20260906_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "production_records",
        sa.Column("serial_numbers", postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.add_column("production_records", sa.Column("photo", sa.String(2000), nullable=True))
    op.create_table(
        "funding_sources",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False, unique=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ux_funding_sources_name_lower", "funding_sources", [sa.text("lower(name)")], unique=True
    )
    for table in ("financial_transactions", "sales", "employee_payments", "inventory_movements"):
        op.add_column(
            table,
            sa.Column(
                "funding_source_id", sa.UUID(), sa.ForeignKey("funding_sources.id"), nullable=True
            ),
        )
    op.add_column(
        "inventory_groups",
        sa.Column(
            "parent_id",
            sa.UUID(),
            sa.ForeignKey("inventory_groups.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "manufactured_items",
        sa.Column(
            "product_id",
            sa.UUID(),
            sa.ForeignKey("manufactured_items.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    # Only unambiguous existing memberships can be inferred without changing user data.
    op.execute("""
        UPDATE manufactured_items m SET product_id = memberships.product_id
        FROM (
            SELECT n.reference_id, (array_agg(DISTINCT p.output_item_id))[1] AS product_id
            FROM technological_process_nodes n
            JOIN technological_process_versions v ON v.id = n.version_id
            JOIN technological_processes p ON p.id = v.process_id
            JOIN manufactured_items product ON product.id = p.output_item_id AND product.is_product
            WHERE n.node_type = 'manufactured_item'
            GROUP BY n.reference_id HAVING count(DISTINCT p.output_item_id) = 1
        ) memberships WHERE m.id = memberships.reference_id AND NOT m.is_product
    """)
    op.create_table(
        "business_documents",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("idempotency_key", sa.String(100), nullable=False, unique=True),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column(
            "funding_source_id", sa.UUID(), sa.ForeignKey("funding_sources.id"), nullable=False
        ),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.Column("created_by", sa.String(200), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_business_documents_kind", "business_documents", ["kind"])
    op.create_table(
        "product_units",
        sa.Column("issued_for_repair_id", sa.UUID(), sa.ForeignKey("business_documents.id"), nullable=True),
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("serial_number", sa.String(200), nullable=False, unique=True),
        sa.Column("product_id", sa.UUID(), sa.ForeignKey("manufactured_items.id"), nullable=False),
        sa.Column(
            "production_record_id",
            sa.UUID(),
            sa.ForeignKey("production_records.id"),
            nullable=False,
        ),
        sa.Column("photo", sa.String(2000), nullable=True),
        sa.Column("sale_id", sa.UUID(), sa.ForeignKey("sales.id"), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    for table in ("funding_sources", "business_documents", "product_units"):
        op.execute(
            f"CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()"
        )


def downgrade() -> None:
    op.execute("ALTER TABLE production_records DROP COLUMN IF EXISTS photo")
    op.execute("ALTER TABLE production_records DROP COLUMN IF EXISTS serial_numbers")
    op.drop_table("product_units")
    op.drop_table("business_documents")
    op.drop_column("manufactured_items", "product_id")
    op.drop_column("inventory_groups", "parent_id")
    for table in ("financial_transactions", "sales", "employee_payments", "inventory_movements"):
        op.drop_column(table, "funding_source_id")
    op.drop_table("funding_sources")
