"""customer_credit_accounts_and_ledger

Revision ID: e5f2a1b9c8d7
Revises: c3f1a2b4d5e6
Create Date: 2026-09-03 16:18:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e5f2a1b9c8d7'
down_revision: Union[str, None] = 'c3f1a2b4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add 'credit' to existing payment_method ENUM
    op.execute("ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'credit'")

    # 2. Create ENUM types for credit subsystem
    credit_status = postgresql.ENUM('disabled', 'active', 'suspended', name='credit_status')
    credit_status.create(op.get_bind(), checkfirst=True)

    customer_payment_method = postgresql.ENUM(
        'cash', 'card', 'wallet', 'bank_transfer', name='customer_payment_method'
    )
    customer_payment_method.create(op.get_bind(), checkfirst=True)

    credit_transaction_type = postgresql.ENUM(
        'credit_sale', 'payment', 'return', 'adjustment', name='credit_transaction_type'
    )
    credit_transaction_type.create(op.get_bind(), checkfirst=True)

    # 3. Add credit columns to customers table
    op.add_column(
        'customers',
        sa.Column(
            'credit_status',
            postgresql.ENUM('disabled', 'active', 'suspended', name='credit_status', create_type=False),
            nullable=False,
            server_default='disabled',
        ),
    )
    op.add_column(
        'customers',
        sa.Column(
            'credit_limit',
            sa.Numeric(precision=10, scale=2),
            nullable=False,
            server_default='0.00',
        ),
    )
    op.add_column(
        'customers',
        sa.Column(
            'payment_terms_days',
            sa.Integer(),
            nullable=True,
            server_default='30',
        ),
    )
    op.create_check_constraint(
        'ck_customer_credit_limit_nonneg', 'customers', 'credit_limit >= 0'
    )

    # 4. Create customer_payments table
    op.create_table(
        'customer_payments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'customer_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('customers.id', ondelete='RESTRICT'),
            nullable=False,
        ),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column(
            'payment_method',
            postgresql.ENUM('cash', 'card', 'wallet', 'bank_transfer', name='customer_payment_method', create_type=False),
            nullable=False,
            server_default='cash',
        ),
        sa.Column('notes', sa.String(length=255), nullable=True),
        sa.Column(
            'user_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.CheckConstraint('amount > 0', name='ck_customer_payment_amount_pos'),
    )
    op.create_index(
        op.f('ix_customer_payments_customer_id'),
        'customer_payments',
        ['customer_id'],
        unique=False,
    )

    # 5. Create customer_credit_transactions table (Append-only Ledger)
    op.create_table(
        'customer_credit_transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'customer_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('customers.id', ondelete='RESTRICT'),
            nullable=False,
        ),
        sa.Column(
            'transaction_type',
            postgresql.ENUM('credit_sale', 'payment', 'return', 'adjustment', name='credit_transaction_type', create_type=False),
            nullable=False,
        ),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('balance_after', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column(
            'sale_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('sales.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column(
            'payment_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('customer_payments.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column(
            'return_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('sale_returns.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column('notes', sa.String(length=255), nullable=True),
        sa.Column(
            'created_by',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.CheckConstraint('amount > 0', name='ck_credit_tx_amount_pos'),
    )
    op.create_index(
        op.f('ix_customer_credit_transactions_customer_id'),
        'customer_credit_transactions',
        ['customer_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_customer_credit_transactions_sale_id'),
        'customer_credit_transactions',
        ['sale_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_customer_credit_transactions_payment_id'),
        'customer_credit_transactions',
        ['payment_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_customer_credit_transactions_return_id'),
        'customer_credit_transactions',
        ['return_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table('customer_credit_transactions')
    op.drop_table('customer_payments')
    op.drop_constraint('ck_customer_credit_limit_nonneg', 'customers', type_='check')
    op.drop_column('customers', 'payment_terms_days')
    op.drop_column('customers', 'credit_limit')
    op.drop_column('customers', 'credit_status')

    op.execute("DROP TYPE IF EXISTS credit_transaction_type")
    op.execute("DROP TYPE IF EXISTS customer_payment_method")
    op.execute("DROP TYPE IF EXISTS credit_status")
