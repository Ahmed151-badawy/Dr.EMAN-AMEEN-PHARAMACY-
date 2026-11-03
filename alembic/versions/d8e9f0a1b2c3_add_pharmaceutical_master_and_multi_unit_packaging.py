"""add_pharmaceutical_master_and_multi_unit_packaging

Revision ID: d8e9f0a1b2c3
Revises: b7c8d9e0f1a2
Create Date: 2026-10-06 21:55:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


STANDARD_DRUG_FAMILIES = [
    ("Analgesics & Anti-inflammatory", "مسكنات ومضادات الالتهاب", "analgesics", "Pain relief and NSAIDs"),
    ("Antibiotics & Antimicrobials", "مضادات حيوية وميكروبية", "antibiotics", "Antibacterial and antifungal therapies"),
    ("Antihypertensives", "أدوية الضغط", "antihypertensives", "Blood pressure regulation"),
    ("Antidiabetics", "أدوية السكر", "antidiabetics", "Blood glucose regulation"),
    ("Antihistamines & Allergy", "مضادات الحساسية", "antihistamines", "Allergy and histamine blockers"),
    ("Gastrointestinal", "أدوية الجهاز الهضمي", "gastrointestinal", "Stomach, acid, and bowel regulation"),
    ("Respiratory & Cough", "أدوية الجهاز التنفسي", "respiratory", "Bronchodilators and expectorants"),
    ("Vitamins & Dietary Supplements", "فيتامينات ومكملات غذائية", "vitamins_supplements", "Nutritional support"),
    ("Cardiovascular & Anticoagulants", "أدوية القلب والأوعية الدموية", "cardiovascular", "Cardiac and blood flow support"),
    ("Thyroid & Hormonal", "أدوية الغدة والهرمونات", "thyroid_hormonal", "Endocrine and hormone therapies"),
    ("Dermatological", "أدوية الجلدية والتجميل", "dermatological", "Topical skin treatments"),
    ("Ophthalmic & Ear", "أدوية العيون والأذن", "ophthalmic_ear", "Eye and ear drops"),
    ("ENT & Cold", "أدوية الأنف والأذن والحنجرة ونزلات البرد", "ent_cold", "Cold, flu, and decongestant treatments"),
]

STANDARD_DOSAGE_FORMS = [
    ("Tablet", "قرص", "tablet"),
    ("Capsule", "كبسولة", "capsule"),
    ("Syrup", "شراب", "syrup"),
    ("Suspension", "معلق", "suspension"),
    ("Oral Drops", "نقط بالفم", "oral_drops"),
    ("Eye Drops", "قطرة للعين", "eye_drops"),
    ("Ear Drops", "قطرة للأذن", "ear_drops"),
    ("Nasal Drops", "نقط أنف", "nasal_drops"),
    ("Nasal Spray", "بخاخ أنف", "nasal_spray"),
    ("Inhaler", "بخاخ استنشاق", "inhaler"),
    ("Cream", "كريم", "cream"),
    ("Ointment", "مرهم", "ointment"),
    ("Topical Gel", "جل موضعي", "gel"),
    ("Suppository", "لبوس", "suppository"),
    ("Ampoule", "أمبول", "ampoule"),
    ("Vial", "فيال", "vial"),
    ("Sachet", "كيس فوار", "sachet"),
    ("Solution", "محلول", "solution"),
    ("Injection", "حقن", "injection"),
]


def upgrade() -> None:
    # 1. Create drug_families table
    op.create_table(
        'drug_families',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name_en', sa.String(150), nullable=False),
        sa.Column('name_ar', sa.String(150), nullable=False),
        sa.Column('code', sa.String(50), nullable=True),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_drug_families_name_en', 'drug_families', ['name_en'])
    op.create_index('ix_drug_families_name_ar', 'drug_families', ['name_ar'])
    op.create_index('ix_drug_families_code', 'drug_families', ['code'], unique=True)

    # 2. Create dosage_forms table
    op.create_table(
        'dosage_forms',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name_en', sa.String(100), nullable=False),
        sa.Column('name_ar', sa.String(100), nullable=False),
        sa.Column('code', sa.String(50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_dosage_forms_name_en', 'dosage_forms', ['name_en'])
    op.create_index('ix_dosage_forms_name_ar', 'dosage_forms', ['name_ar'])
    op.create_index('ix_dosage_forms_code', 'dosage_forms', ['code'], unique=True)

    # 3. Create active_ingredients table
    op.create_table(
        'active_ingredients',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name_en', sa.String(200), nullable=False),
        sa.Column('name_ar', sa.String(200), nullable=True),
        sa.Column('normalized_name', sa.String(200), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_active_ingredients_name_en', 'active_ingredients', ['name_en'])
    op.create_index('ix_active_ingredients_name_ar', 'active_ingredients', ['name_ar'])
    op.create_index('ix_active_ingredients_normalized_name', 'active_ingredients', ['normalized_name'])

    # 4. Create medicine_active_ingredients junction table
    op.create_table(
        'medicine_active_ingredients',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('medicine_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('medicines.id', ondelete='CASCADE'), nullable=False),
        sa.Column('active_ingredient_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('active_ingredients.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('strength_value', sa.Numeric(10, 3), nullable=True),
        sa.Column('strength_unit', sa.String(30), nullable=True),
        sa.Column('display_strength', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('medicine_id', 'active_ingredient_id', name='uq_medicine_active_ingredient')
    )
    op.create_index('ix_medicine_active_ingredients_medicine_id', 'medicine_active_ingredients', ['medicine_id'])
    op.create_index('ix_medicine_active_ingredients_ingredient_id', 'medicine_active_ingredients', ['active_ingredient_id'])

    # 5. Create medicine_package_units table
    op.create_table(
        'medicine_package_units',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('medicine_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('medicines.id', ondelete='CASCADE'), nullable=False),
        sa.Column('unit_name_en', sa.String(50), nullable=False),
        sa.Column('unit_name_ar', sa.String(50), nullable=False),
        sa.Column('conversion_factor', sa.Numeric(10, 4), nullable=False, server_default='1.0'),
        sa.Column('selling_price', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
        sa.Column('purchase_price', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
        sa.Column('barcode', sa.String(64), nullable=True),
        sa.Column('is_base_unit', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_default_dispense', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('allow_selling', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint('conversion_factor > 0', name='ck_pkg_conversion_factor_positive'),
        sa.CheckConstraint('selling_price >= 0', name='ck_pkg_selling_price_nonneg'),
        sa.CheckConstraint('purchase_price >= 0', name='ck_pkg_purchase_price_nonneg'),
        sa.UniqueConstraint('medicine_id', 'unit_name_en', name='uq_medicine_unit_name_en')
    )
    op.create_index('ix_medicine_package_units_medicine_id', 'medicine_package_units', ['medicine_id'])
    op.create_index('ix_medicine_package_units_barcode', 'medicine_package_units', ['barcode'], unique=True)
    # Database-level partial unique index to guarantee at most one base unit per medicine
    op.execute(
        "CREATE UNIQUE INDEX uq_medicine_base_unit ON medicine_package_units (medicine_id) WHERE is_base_unit = true;"
    )

    # 6. Add new columns to medicines table
    op.add_column('medicines', sa.Column('name_ar', sa.String(200), nullable=True))
    op.create_index('ix_medicines_name_ar', 'medicines', ['name_ar'])
    op.add_column('medicines', sa.Column('drug_family_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('drug_families.id', ondelete='SET NULL'), nullable=True))
    op.add_column('medicines', sa.Column('dosage_form_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('dosage_forms.id', ondelete='SET NULL'), nullable=True))
    op.add_column('medicines', sa.Column('strength', sa.String(100), nullable=True))
    op.add_column('medicines', sa.Column('base_unit_name', sa.String(50), nullable=False, server_default='Unit'))

    # 7. Add packaging columns to sale_items table
    op.add_column('sale_items', sa.Column('package_unit_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('medicine_package_units.id', ondelete='SET NULL'), nullable=True))
    op.add_column('sale_items', sa.Column('unit_name', sa.String(50), nullable=True))
    op.add_column('sale_items', sa.Column('conversion_factor', sa.Numeric(10, 4), nullable=False, server_default='1.0'))
    op.add_column('sale_items', sa.Column('base_quantity', sa.Integer(), nullable=False, server_default='1'))
    op.create_check_constraint('ck_sale_item_conversion_factor_positive', 'sale_items', 'conversion_factor > 0')
    op.create_check_constraint('ck_sale_item_base_qty_positive', 'sale_items', 'base_quantity > 0')

    # 8. Add packaging columns to purchase_items table
    op.add_column('purchase_items', sa.Column('package_unit_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('medicine_package_units.id', ondelete='SET NULL'), nullable=True))
    op.add_column('purchase_items', sa.Column('unit_name', sa.String(50), nullable=True))
    op.add_column('purchase_items', sa.Column('conversion_factor', sa.Numeric(10, 4), nullable=False, server_default='1.0'))
    op.add_column('purchase_items', sa.Column('base_quantity', sa.Integer(), nullable=False, server_default='1'))
    op.create_check_constraint('ck_purchase_item_conversion_factor_positive', 'purchase_items', 'conversion_factor > 0')
    op.create_check_constraint('ck_purchase_item_base_qty_positive', 'purchase_items', 'base_quantity > 0')

    # 9. Seed Standard Drug Families
    drug_fam_table = sa.table(
        'drug_families',
        sa.column('id', postgresql.UUID(as_uuid=True)),
        sa.column('name_en', sa.String),
        sa.column('name_ar', sa.String),
        sa.column('code', sa.String),
        sa.column('description', sa.String),
        sa.column('is_active', sa.Boolean),
    )
    for name_en, name_ar, code, desc in STANDARD_DRUG_FAMILIES:
        op.execute(
            drug_fam_table.insert().values(
                id=uuid.uuid4(),
                name_en=name_en,
                name_ar=name_ar,
                code=code,
                description=desc,
                is_active=True,
            )
        )

    # 10. Seed Standard Dosage Forms
    dosage_form_table = sa.table(
        'dosage_forms',
        sa.column('id', postgresql.UUID(as_uuid=True)),
        sa.column('name_en', sa.String),
        sa.column('name_ar', sa.String),
        sa.column('code', sa.String),
        sa.column('is_active', sa.Boolean),
    )
    for name_en, name_ar, code in STANDARD_DOSAGE_FORMS:
        op.execute(
            dosage_form_table.insert().values(
                id=uuid.uuid4(),
                name_en=name_en,
                name_ar=name_ar,
                code=code,
                is_active=True,
            )
        )

    # 11. Backfill existing medicines with an authoritative base unit package
    op.execute("""
        INSERT INTO medicine_package_units (
            id,
            medicine_id,
            unit_name_en,
            unit_name_ar,
            conversion_factor,
            selling_price,
            purchase_price,
            barcode,
            is_base_unit,
            is_default_dispense,
            allow_selling,
            is_active,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            id,
            COALESCE(NULLIF(form, ''), 'Unit'),
            'وحدة',
            1.0000,
            selling_price,
            purchase_price,
            NULL, -- Leave package barcode null so medicines.barcode remains authoritative default
            true,
            true,
            true,
            true,
            NOW(),
            NOW()
        FROM medicines;
    """)

    # 12. Backfill historical sale_items & purchase_items
    op.execute("""
        UPDATE sale_items
        SET base_quantity = quantity,
            conversion_factor = 1.0000,
            unit_name = 'Unit'
        WHERE base_quantity IS NULL OR base_quantity = 1;
    """)
    op.execute("""
        UPDATE purchase_items
        SET base_quantity = quantity,
            conversion_factor = 1.0000,
            unit_name = 'Unit'
        WHERE base_quantity IS NULL OR base_quantity = 1;
    """)


def downgrade() -> None:
    op.drop_constraint('ck_purchase_item_base_qty_positive', 'purchase_items', type_='check')
    op.drop_constraint('ck_purchase_item_conversion_factor_positive', 'purchase_items', type_='check')
    op.drop_column('purchase_items', 'base_quantity')
    op.drop_column('purchase_items', 'conversion_factor')
    op.drop_column('purchase_items', 'unit_name')
    op.drop_column('purchase_items', 'package_unit_id')

    op.drop_constraint('ck_sale_item_base_qty_positive', 'sale_items', type_='check')
    op.drop_constraint('ck_sale_item_conversion_factor_positive', 'sale_items', type_='check')
    op.drop_column('sale_items', 'base_quantity')
    op.drop_column('sale_items', 'conversion_factor')
    op.drop_column('sale_items', 'unit_name')
    op.drop_column('sale_items', 'package_unit_id')

    op.drop_column('medicines', 'base_unit_name')
    op.drop_column('medicines', 'strength')
    op.drop_column('medicines', 'dosage_form_id')
    op.drop_column('medicines', 'drug_family_id')
    op.drop_index('ix_medicines_name_ar', table_name='medicines')
    op.drop_column('medicines', 'name_ar')

    op.execute("DROP INDEX IF EXISTS uq_medicine_base_unit;")
    op.drop_index('ix_medicine_package_units_barcode', table_name='medicine_package_units')
    op.drop_index('ix_medicine_package_units_medicine_id', table_name='medicine_package_units')
    op.drop_table('medicine_package_units')

    op.drop_index('ix_medicine_active_ingredients_ingredient_id', table_name='medicine_active_ingredients')
    op.drop_index('ix_medicine_active_ingredients_medicine_id', table_name='medicine_active_ingredients')
    op.drop_table('medicine_active_ingredients')

    op.drop_index('ix_active_ingredients_normalized_name', table_name='active_ingredients')
    op.drop_index('ix_active_ingredients_name_ar', table_name='active_ingredients')
    op.drop_index('ix_active_ingredients_name_en', table_name='active_ingredients')
    op.drop_table('active_ingredients')

    op.drop_index('ix_dosage_forms_code', table_name='dosage_forms')
    op.drop_index('ix_dosage_forms_name_ar', table_name='dosage_forms')
    op.drop_index('ix_dosage_forms_name_en', table_name='dosage_forms')
    op.drop_table('dosage_forms')

    op.drop_index('ix_drug_families_code', table_name='drug_families')
    op.drop_index('ix_drug_families_name_ar', table_name='drug_families')
    op.drop_index('ix_drug_families_name_en', table_name='drug_families')
    op.drop_table('drug_families')
