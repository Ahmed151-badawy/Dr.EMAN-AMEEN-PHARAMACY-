"""add_controlled_medicines_and_audit_snapshots

Revision ID: c7d8e9f0a1b2
Revises: e1f2a3b4c5d6
Create Date: 2026-10-24 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add controlled medicine classification to medicines table
    op.add_column(
        "medicines",
        sa.Column("is_controlled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "medicines",
        sa.Column("controlled_schedule", sa.String(length=50), nullable=True),
    )
    op.create_index(
        op.f("ix_medicines_is_controlled"), "medicines", ["is_controlled"], unique=False
    )
    op.create_index(
        op.f("ix_medicines_controlled_schedule"), "medicines", ["controlled_schedule"], unique=False
    )

    # 2. Add controlled medicine flag and purchaser/prescription details to sales table
    op.add_column(
        "sales",
        sa.Column("has_controlled_medicine", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("sales", sa.Column("purchaser_name", sa.String(length=150), nullable=True))
    op.add_column("sales", sa.Column("purchaser_id_number", sa.String(length=50), nullable=True))
    op.add_column("sales", sa.Column("purchaser_phone", sa.String(length=30), nullable=True))
    op.add_column("sales", sa.Column("prescription_reference", sa.String(length=100), nullable=True))
    op.add_column("sales", sa.Column("doctor_name", sa.String(length=150), nullable=True))
    op.add_column("sales", sa.Column("doctor_license", sa.String(length=50), nullable=True))
    op.add_column("sales", sa.Column("prescription_date", sa.Date(), nullable=True))
    op.create_index(
        op.f("ix_sales_has_controlled_medicine"), "sales", ["has_controlled_medicine"], unique=False
    )

    # 3. Add immutable transaction snapshots to sale_items table
    op.add_column("sale_items", sa.Column("medicine_name_snapshot", sa.String(length=200), nullable=True))
    op.add_column("sale_items", sa.Column("classification_snapshot", sa.String(length=50), nullable=True))
    op.add_column("sale_items", sa.Column("controlled_schedule_snapshot", sa.String(length=50), nullable=True))
    op.add_column("sale_items", sa.Column("batch_number_snapshot", sa.String(length=100), nullable=True))

    # Backfill historical snapshots for existing sale_items using current records
    op.execute(
        """
        UPDATE sale_items si
        SET medicine_name_snapshot = m.name,
            classification_snapshot = CASE WHEN m.is_controlled THEN 'controlled' ELSE 'ordinary' END,
            controlled_schedule_snapshot = m.controlled_schedule,
            batch_number_snapshot = mb.batch_number
        FROM medicines m, medicine_batches mb
        WHERE si.medicine_id = m.id AND si.batch_id = mb.id
        """
    )

    # 4. Create audit_logs table for tracking report exports and sensitive actions
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("details", sa.String(length=1000), nullable=True),
        sa.Column("ip_address", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"], unique=False)
    op.create_index(op.f("ix_audit_logs_user_id"), "audit_logs", ["user_id"], unique=False)
    op.create_index(op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_logs_created_at"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_user_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_action"), table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_column("sale_items", "batch_number_snapshot")
    op.drop_column("sale_items", "controlled_schedule_snapshot")
    op.drop_column("sale_items", "classification_snapshot")
    op.drop_column("sale_items", "medicine_name_snapshot")

    op.drop_index(op.f("ix_sales_has_controlled_medicine"), table_name="sales")
    op.drop_column("sales", "prescription_date")
    op.drop_column("sales", "doctor_license")
    op.drop_column("sales", "doctor_name")
    op.drop_column("sales", "prescription_reference")
    op.drop_column("sales", "purchaser_phone")
    op.drop_column("sales", "purchaser_id_number")
    op.drop_column("sales", "purchaser_name")
    op.drop_column("sales", "has_controlled_medicine")

    op.drop_index(op.f("ix_medicines_controlled_schedule"), table_name="medicines")
    op.drop_index(op.f("ix_medicines_is_controlled"), table_name="medicines")
    op.drop_column("medicines", "controlled_schedule")
    op.drop_column("medicines", "is_controlled")
