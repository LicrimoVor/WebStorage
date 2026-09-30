import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, Index, Numeric, String, Text, func
from sqlalchemy import ForeignKey as FundingForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPrimaryKeyMixin
from app.modules.finance.funding import FundingMixin


class FinancialTransaction(FundingMixin, UUIDPrimaryKeyMixin, Base):
    __tablename__ = "financial_transactions"
    __table_args__ = (
        CheckConstraint(
            "transaction_type IN ('income', 'expense')",
            name="transaction_type_valid",
        ),
        CheckConstraint("amount > 0", name="amount_positive"),
        Index("ix_financial_transactions_occurred", "occurred_at"),
        Index("ix_financial_transactions_type_category", "transaction_type", "category"),
    )

    funding_source_id: Mapped[uuid.UUID | None] = mapped_column(
        FundingForeignKey("funding_sources.id"), nullable=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        FundingForeignKey("business_documents.id"), nullable=True
    )
    id: Mapped[uuid.UUID]
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    category: Mapped[str] = mapped_column(String(200), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class FinanceChange(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "finance_changes"
    entry_id: Mapped[uuid.UUID] = mapped_column(index=True)
    before: Mapped[dict[str, Any]] = mapped_column(JSONB)
    after: Mapped[dict[str, Any]] = mapped_column(JSONB)
    reason: Mapped[str] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
