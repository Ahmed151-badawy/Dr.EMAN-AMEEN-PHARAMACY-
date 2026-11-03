import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class InventoryImportSession(Base, TimestampMixin):
    """
    Tracks an Excel inventory import session from upload/preview to controlled commit.
    Ensures idempotency, audit trail, and rollback safety.
    """

    __tablename__ = "inventory_import_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="previewed", index=True
    )  # 'previewed', 'committed', 'partially_committed', 'failed'
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    total_medicines: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    valid_medicines: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    flagged_medicines: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    total_batches: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    valid_batches: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    quarantined_batches: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    committed_medicines: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    committed_batches: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    report_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_data_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User | None"] = relationship()

    def __repr__(self) -> str:
        return f"<InventoryImportSession {self.id} {self.filename} status={self.status}>"

