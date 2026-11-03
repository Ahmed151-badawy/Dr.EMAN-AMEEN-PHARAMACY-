"""add_is_primary_admin_to_users

Revision ID: f6a7b8c9d0e1
Revises: e5f2a1b9c8d7
Create Date: 2026-09-03 18:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f2a1b9c8d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add column is_primary_admin with default false
    op.add_column(
        'users',
        sa.Column('is_primary_admin', sa.Boolean(), nullable=False, server_default=sa.text('false'))
    )

    # 2. Designate the primary admin (e.g. user 'admin' or first admin created)
    op.execute("""
        UPDATE users
        SET is_primary_admin = true
        WHERE id = (
            SELECT id FROM users
            WHERE role = 'admin'
            ORDER BY created_at ASC
            LIMIT 1
        )
    """)


def downgrade() -> None:
    op.drop_column('users', 'is_primary_admin')
