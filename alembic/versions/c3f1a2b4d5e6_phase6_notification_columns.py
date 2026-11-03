"""phase6_notification_columns

Revision ID: c3f1a2b4d5e6
Revises: 8a33712f6b8d
Create Date: 2026-09-02 20:26:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c3f1a2b4d5e6'
down_revision: Union[str, None] = '8a33712f6b8d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add is_resolved: lifecycle flag for the notification alert system.
    op.add_column(
        'notifications',
        sa.Column('is_resolved', sa.Boolean(), nullable=False, server_default='false')
    )
    # Add related_batch_id: per-batch FK for EXPIRING_SOON / EXPIRED deduplication.
    op.add_column(
        'notifications',
        sa.Column('related_batch_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        'fk_notifications_related_batch_id',
        'notifications',
        'medicine_batches',
        ['related_batch_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_notifications_related_batch_id', 'notifications', type_='foreignkey')
    op.drop_column('notifications', 'related_batch_id')
    op.drop_column('notifications', 'is_resolved')
