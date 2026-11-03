"""add_inventory_import_sessions

Revision ID: a1b2c3d4e5f6
Revises: c7d8e9f0a1b2
Create Date: 2026-10-31 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'c7d8e9f0a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'inventory_import_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('file_hash', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='previewed'),
        sa.Column('uploaded_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('total_medicines', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('valid_medicines', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('flagged_medicines', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_batches', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('valid_batches', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('quarantined_batches', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('committed_medicines', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('committed_batches', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('report_json', sa.Text(), nullable=True),
        sa.Column('raw_data_json', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_inventory_import_sessions_file_hash', 'inventory_import_sessions', ['file_hash'], unique=False)
    op.create_index('ix_inventory_import_sessions_status', 'inventory_import_sessions', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_inventory_import_sessions_status', table_name='inventory_import_sessions')
    op.drop_index('ix_inventory_import_sessions_file_hash', table_name='inventory_import_sessions')
    op.drop_table('inventory_import_sessions')

