"""add_financial_management_and_expenses

Revision ID: b7c8d9e0f1a2
Revises: f6a7b8c9d0e1
Create Date: 2026-09-07 15:35:00.000000

"""
from typing import Sequence, Union
import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create financial_payment_method enum if it doesn't already exist
    bind = op.get_bind()
    payment_method_type = postgresql.ENUM(
        'cash', 'card', 'wallet', 'bank_transfer',
        name='financial_payment_method',
        create_type=False
    )
    payment_method_type.create(bind, checkfirst=True)

    # 2. Create expense_categories table
    op.create_table(
        'expense_categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('name_ar', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_expense_categories_name', 'expense_categories', ['name'], unique=True)

    # 3. Create expenses table
    op.create_table(
        'expenses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('expense_categories.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('expense_date', sa.Date(), nullable=False),
        sa.Column('payment_method', payment_method_type, nullable=False, server_default='cash'),
        sa.Column('description', sa.String(length=255), nullable=False),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('amount > 0', name='ck_expense_amount_positive'),
    )
    op.create_index('ix_expenses_category_id', 'expenses', ['category_id'])
    op.create_index('ix_expenses_expense_date', 'expenses', ['expense_date'])

    # 4. Create supplier_payments table
    op.create_table(
        'supplier_payments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('supplier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('suppliers.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('purchase_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('purchases.id', ondelete='SET NULL'), nullable=True),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('payment_date', sa.Date(), nullable=False),
        sa.Column('payment_method', payment_method_type, nullable=False, server_default='cash'),
        sa.Column('reference_number', sa.String(length=100), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('amount > 0', name='ck_supplier_payment_amount_positive'),
    )
    op.create_index('ix_supplier_payments_supplier_id', 'supplier_payments', ['supplier_id'])
    op.create_index('ix_supplier_payments_purchase_id', 'supplier_payments', ['purchase_id'])
    op.create_index('ix_supplier_payments_payment_date', 'supplier_payments', ['payment_date'])

    # 5. Seed default starter expense categories
    starter_categories = [
        ("Rent", "إيجار الصيدلية", "Monthly pharmacy premises rental"),
        ("Salaries", "مرتبات وأجور", "Staff, pharmacist, and assistant wages"),
        ("Electricity", "كهرباء", "Electricity utility bill"),
        ("Water", "مياه", "Water utility bill"),
        ("Internet", "إنترنت وهاتف", "Telecom, internet, and communication bills"),
        ("Maintenance", "صيانة وتجهيزات", "Equipment, air conditioning, and fixtures upkeep"),
        ("Transportation", "نقل ومواصلات", "Courier, freight, and travel expenses"),
        ("Cleaning", "نظافة ومطهرات", "Cleaning supplies, detergents, and sanitizers"),
        ("Other", "مصاريف تشغيل أخرى", "Miscellaneous operational and overhead expenses"),
    ]

    for name, name_ar, desc in starter_categories:
        cat_id = str(uuid.uuid4())
        op.execute(
            sa.text(
                "INSERT INTO expense_categories (id, name, name_ar, description, is_active, created_at, updated_at) "
                "VALUES (:id, :name, :name_ar, :description, true, NOW(), NOW())"
            ).bindparams(id=cat_id, name=name, name_ar=name_ar, description=desc)
        )


def downgrade() -> None:
    op.drop_table('supplier_payments')
    op.drop_table('expenses')
    op.drop_table('expense_categories')
    op.execute("DROP TYPE IF EXISTS financial_payment_method")
