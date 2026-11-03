"""add_product_categories_and_dosage_subtypes

Revision ID: e1f2a3b4c5d6
Revises: d8e9f0a1b2c3
Create Date: 2026-10-09 17:15:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd8e9f0a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


STANDARD_PRODUCT_CATEGORIES = [
    ("Medicines", "الأدوية", "medicines", "Pharmaceutical medicines and prescription drugs", [
        ("Prescription Medicines (Rx)", "أدوية بوصفة طبية", "rx_medicines", "Prescription-only drugs"),
        ("Over The Counter (OTC)", "أدوية بدون وصفة", "otc_medicines", "General OTC medications"),
    ]),
    ("Personal Hygiene", "النظافة الشخصية", "personal_hygiene", "Personal cleanliness and daily hygiene", [
        ("Soaps & Body Washes", "صابون وغسول الجسم", "soaps_body_washes", "Cleansing soaps and shower gels"),
        ("Deodorants & Antiperspirants", "مزيلات العرق", "deodorants", "Roll-ons, sprays, and sticks"),
        ("Hand Sanitizers & Wipes", "معقمات اليدين والمناديل", "hand_sanitizers", "Antibacterial gels and wipes"),
    ]),
    ("Feminine Care", "العناية النسائية", "feminine_care", "Feminine hygiene and intimate care products", [
        ("Sanitary Pads", "فوط صحية", "sanitary_pads", "Day and night sanitary pads"),
        ("Tampons", "سدادات قطنية", "tampons", "Tampons and applicators"),
        ("Panty Liners", "فوط يومية", "panty_liners", "Daily fresh panty liners"),
        ("Intimate Washes", "غسول نسائي حميمي", "intimate_wash", "Cleansing intimate lotions"),
    ]),
    ("Baby Care", "العناية بالطفل", "baby_care", "Infant hygiene, nutrition, and care accessories", [
        ("Baby Diapers & Pants", "حفاضات الأطفال وكيلوت", "baby_diapers", "All sizes diapers and training pants"),
        ("Baby Wipes", "مناديل الأطفال المبللة", "baby_wipes", "Sensitive and perfumed wipes"),
        ("Baby Shampoo & Bath", "شامبو واستحمام الأطفال", "baby_shampoo", "Tear-free shampoos and baths"),
        ("Baby Lotions & Creams", "لوشن وكريمات الأطفال", "baby_lotions", "Diaper rash creams and moisturizers"),
        ("Feeding Accessories", "مستلزمات التغذية والرضاعة", "baby_feeding", "Bottles, pacifiers, and cups"),
    ]),
    ("Adult Incontinence", "منتجات سلس البول لكبار السن", "adult_incontinence", "Adult incontinence pads, pull-ups, and bed mats", [
        ("Adult Diapers", "حفاضات كبار السن", "adult_diapers", "Slip and pull-up adult briefs"),
        ("Bed Underpads", "مفارش سرير طبية", "underpads", "Disposable protective underpads"),
        ("Incontinence Liners", "حشوات وحفاضات نهارية", "incontinence_liners", "Anatomic pads and inserts"),
    ]),
    ("Skincare & Cosmetics", "العناية بالبشرة ومستحضرات التجميل", "skincare_cosmetics", "Dermatological skincare and beauty essentials", [
        ("Moisturizers & Creams", "مرطبات وكريمات البشرة", "moisturizers", "Hydrating lotions and barrier creams"),
        ("Facial Cleansers", "غسول ومنظفات الوجه", "cleansers", "Foaming washes and micellar waters"),
        ("Sunscreens & Sunblocks", "واقيات الشمس", "sunscreens", "SPF 50+ creams and fluids"),
        ("Serums & Anti-Aging", "سيروم وعلاجات البشرة", "serums", "Vitamin C, Hyaluronic, and Retinol"),
        ("Lip Balms & Care", "مرطبات الشفاه", "lip_care", "Protective and soothing lip balms"),
    ]),
    ("Hair Care", "العناية بالشعر", "hair_care", "Shampoos, conditioners, and hair therapy", [
        ("Shampoo", "شامبو الشعر", "shampoo", "Daily and nourishing shampoos"),
        ("Conditioner", "بلسم الشعر", "conditioner", "Hydrating hair conditioners"),
        ("Hair Treatments & Oils", "زيوت وعلاجات الشعر", "hair_treatments", "Hair masks, serums, and oils"),
        ("Anti-Dandruff Treatments", "علاجات قشرة الشعر", "anti_dandruff", "Specialized therapeutic shampoos"),
    ]),
    ("Oral Care", "العناية بالفم والأسنان", "oral_care", "Dentistry and daily dental hygiene", [
        ("Toothpaste", "معجون الأسنان", "toothpaste", "Cavity protection, whitening, sensitive"),
        ("Toothbrushes", "فرش الأسنان", "toothbrushes", "Manual and electric brushes"),
        ("Mouthwash & Rinses", "غسول الفم", "mouthwash", "Antiseptic and freshening rinses"),
        ("Dental Floss", "خيط الأسنان الطبي", "dental_floss", "Waxed floss and dental picks"),
    ]),
    ("First Aid & Medical Supplies", "الإسعافات الأولية والمستلزمات الطبية", "first_aid", "Dressings, antiseptics, and emergency supplies", [
        ("Bandages & Gauze", "ضمادات وشاش طبي", "bandages_gauze", "Sterile gauze rolls and compress pads"),
        ("Antiseptics & Alcohol", "مطهرات وكحول طبي", "antiseptics", "Povidone iodine, 70% ethanol, chlorhexidine"),
        ("Adhesive Plasters", "بلاستر طبي ولاصقات", "adhesive_plasters", "Waterproof and fabric adhesive strips"),
        ("Cotton & Swabs", "قطن طبي ومسحات", "cotton_swabs", "Sterile cotton rolls and applicator swabs"),
        ("Medical Gloves & Masks", "قفازات وكمامات طبية", "gloves_masks", "Nitrile/latex gloves and surgical masks"),
    ]),
    ("Health Devices & Home Care", "الأجهزة والمستلزمات الطبية المنزلية", "health_devices", "Diagnostic and supportive home devices", [
        ("Blood Pressure Monitors", "أجهزة قياس ضغط الدم", "bp_monitors", "Digital upper arm and wrist monitors"),
        ("Blood Glucose Meters & Strips", "أجهزة وشرائط السكر", "glucose_meters", "Glucometers, test strips, and lancets"),
        ("Thermometers", "أجهزة قياس الحرارة", "thermometers", "Infrared forehead and digital oral thermometers"),
        ("Nebulizers & Inhalers", "أجهزة الاستنشاق والبخار", "nebulizers", "Compressor and mesh nebulizers"),
    ]),
    ("Other Pharmacy Products", "منتجات صيدلانية أخرى", "other_pharmacy_products", "General retail and home items", [
        ("General Home Essentials", "مستلزمات عامة", "misc_home_care", "General pharmacy sundries"),
    ]),
]

COMPREHENSIVE_DOSAGE_FORMS = [
    # Solid oral medicines
    ("Tablet", "قرص", "tablet", "Solid oral", "Standard tablet"),
    ("Uncoated Tablet", "قرص غير مغلف", "tablet_uncoated", "Solid oral", "Uncoated tablet"),
    ("Film-Coated Tablet", "قرص مغلف بغشاء", "tablet_film_coated", "Solid oral", "Film-coated tablet"),
    ("Enteric-Coated Tablet", "قرص مغلف معوياً", "tablet_enteric_coated", "Solid oral", "Enteric-coated tablet"),
    ("Extended-Release Tablet", "قرص ممتد المفعول", "tablet_extended_release", "Solid oral", "Modified/Extended-release tablet"),
    ("Effervescent Tablet", "قرص فوار", "tablet_effervescent", "Solid oral", "Effervescent tablet"),
    ("Chewable Tablet", "قرص للمضغ", "tablet_chewable", "Solid oral", "Chewable tablet"),
    ("Dispersible Tablet", "قرص قابل للتفتت", "tablet_dispersible", "Solid oral", "Dispersible tablet"),
    ("Capsule", "كبسولة", "capsule", "Solid oral", "Hard or soft gelatin capsule"),
    ("Powder & Sachet", "بودرة وكيس فوار", "powder_sachet", "Solid oral", "Powder or granule sachet"),

    # Suppositories and vaginal
    ("Rectal Suppository", "لبوس / تحميلة شرجية", "suppository_rectal", "Suppositories & vaginal", "Rectal suppository"),
    ("Vaginal Suppository / Pessary", "تحميلة / لبوس مهبلي", "suppository_vaginal", "Suppositories & vaginal", "Vaginal ovule or pessary"),
    ("Vaginal Douche & Wash", "دش / غسول مهبلي", "vaginal_douche", "Suppositories & vaginal", "Vaginal wash"),

    # Oral liquids
    ("Syrup", "شراب", "syrup", "Oral liquids", "Oral syrup"),
    ("Suspension", "معلق فموي", "suspension", "Oral liquids", "Oral suspension"),
    ("Oral Solution", "محلول فموي", "solution_oral", "Oral liquids", "Oral solution"),
    ("Oral Drops", "نقط بالفم", "drops_oral", "Oral liquids", "Oral pediatric drops"),

    # Other liquids
    ("Eye Drops", "قطرة للعين", "drops_eye", "Other liquids", "Ophthalmic eye drops"),
    ("Ear Drops", "قطرة للأذن", "drops_ear", "Other liquids", "Otic ear drops"),
    ("Nasal Drops", "قطرة للأنف", "drops_nasal", "Other liquids", "Nasal decongestant/saline drops"),
    ("Nasal Spray", "بخاخ للأنف", "spray_nasal", "Other liquids", "Nasal aerosol or pump spray"),
    ("Topical Solution", "محلول موضعي", "solution_topical", "Other liquids", "External application solution"),
    ("IV Infusion Solution", "محلول وريدي بالتنقيط", "solution_infusion", "Other liquids", "Intravenous infusion"),

    # Injectable medicines
    ("Ampoule", "أمبول", "ampoule", "Injectable", "Injectable single-dose ampoule"),
    ("Vial", "فيال", "vial", "Injectable", "Injectable multi-dose vial"),
    ("Prefilled Syringe", "حقنة معبأة مسبقاً", "syringe_prefilled", "Injectable", "Pre-filled injectable syringe"),
    ("Injectable Solution", "محلول للحقن", "solution_injectable", "Injectable", "Ready injectable solution"),
    ("Powder for Injection", "بودرة للحقن بعد الحل", "powder_injectable", "Injectable", "Lyophilized powder for reconstitution"),

    # Topical and other dosage forms
    ("Cream", "كريم", "cream", "Topical", "Dermatological cream"),
    ("Ointment", "مرهم", "ointment", "Topical", "Dermatological ointment"),
    ("Gel", "جل", "gel", "Topical", "Topical gel"),
    ("Lotion", "لوشن", "lotion", "Topical", "Topical lotion"),
    ("Topical Spray", "بخاخ موضعي", "spray_topical", "Topical", "Topical spray"),
    ("Inhaler / Inhalation Aerosol", "بخاخ استنشاق", "inhaler", "Topical", "Metered-dose or dry powder inhaler"),
    ("Transdermal Patch", "لاصقة طبية عبر الجلد", "transdermal_patch", "Topical", "Transdermal patch"),
]


def upgrade() -> None:
    # 1. Create product_categories table
    op.create_table(
        "product_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("name_en", sa.String(100), nullable=False),
        sa.Column("name_ar", sa.String(100), nullable=False),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_product_categories_name_en", "product_categories", ["name_en"])
    op.create_index("ix_product_categories_name_ar", "product_categories", ["name_ar"])
    op.create_index("ix_product_categories_code", "product_categories", ["code"])

    # 2. Create product_subcategories table
    op.create_table(
        "product_subcategories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("product_categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name_en", sa.String(100), nullable=False),
        sa.Column("name_ar", sa.String(100), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("category_id", "code", name="uq_subcategory_category_code"),
    )
    op.create_index("ix_product_subcategories_category_id", "product_subcategories", ["category_id"])
    op.create_index("ix_product_subcategories_code", "product_subcategories", ["code"])

    # 3. Add columns to medicines table
    op.add_column("medicines", sa.Column("product_type", sa.String(50), nullable=False, server_default="medicine"))
    op.add_column("medicines", sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("medicines", sa.Column("subcategory_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("medicines", sa.Column("sku", sa.String(64), nullable=True))
    op.create_index("ix_medicines_sku", "medicines", ["sku"], unique=True)
    op.create_index("ix_medicines_product_type", "medicines", ["product_type"])
    op.create_foreign_key("medicines_category_id_fkey", "medicines", "product_categories", ["category_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("medicines_subcategory_id_fkey", "medicines", "product_subcategories", ["subcategory_id"], ["id"], ondelete="SET NULL")

    # 4. Add subtype and category to dosage_forms
    op.add_column("dosage_forms", sa.Column("category", sa.String(50), nullable=True))
    op.add_column("dosage_forms", sa.Column("subtype", sa.String(100), nullable=True))
    op.create_index("ix_dosage_forms_category", "dosage_forms", ["category"])

    # 5. Seed Product Categories and Subcategories
    conn = op.get_bind()
    for cat_en, cat_ar, cat_code, cat_desc, subcats in STANDARD_PRODUCT_CATEGORIES:
        cat_id = uuid.uuid4()
        conn.execute(
            sa.text(
                """
                INSERT INTO product_categories (id, name_en, name_ar, code, description, is_active, created_at, updated_at)
                VALUES (:id, :name_en, :name_ar, :code, :description, true, now(), now())
                ON CONFLICT (code) DO NOTHING
                """
            ),
            {"id": cat_id, "name_en": cat_en, "name_ar": cat_ar, "code": cat_code, "description": cat_desc}
        )
        # Fetch the actual ID (either newly inserted or existing)
        actual_cat_row = conn.execute(
            sa.text("SELECT id FROM product_categories WHERE code = :code"),
            {"code": cat_code}
        ).fetchone()
        if actual_cat_row:
            actual_cat_id = actual_cat_row[0]
            for sub_en, sub_ar, sub_code, sub_desc in subcats:
                conn.execute(
                    sa.text(
                        """
                        INSERT INTO product_subcategories (id, category_id, name_en, name_ar, code, description, is_active, created_at, updated_at)
                        VALUES (:id, :cat_id, :name_en, :name_ar, :code, :description, true, now(), now())
                        ON CONFLICT (category_id, code) DO NOTHING
                        """
                    ),
                    {
                        "id": uuid.uuid4(),
                        "cat_id": actual_cat_id,
                        "name_en": sub_en,
                        "name_ar": sub_ar,
                        "code": sub_code,
                        "description": sub_desc,
                    }
                )

    # 6. Seed / update Comprehensive Dosage Forms
    for name_en, name_ar, code, category, subtype in COMPREHENSIVE_DOSAGE_FORMS:
        conn.execute(
            sa.text(
                """
                INSERT INTO dosage_forms (id, name_en, name_ar, code, category, subtype, is_active, created_at, updated_at)
                VALUES (:id, :name_en, :name_ar, :code, :category, :subtype, true, now(), now())
                ON CONFLICT (code) DO UPDATE
                SET name_en = EXCLUDED.name_en,
                    name_ar = EXCLUDED.name_ar,
                    category = EXCLUDED.category,
                    subtype = EXCLUDED.subtype
                """
            ),
            {
                "id": uuid.uuid4(),
                "name_en": name_en,
                "name_ar": name_ar,
                "code": code,
                "category": category,
                "subtype": subtype,
            }
        )


def downgrade() -> None:
    op.drop_column("dosage_forms", "subtype")
    op.drop_column("dosage_forms", "category")
    op.drop_constraint("medicines_subcategory_id_fkey", "medicines", type_="foreignkey")
    op.drop_constraint("medicines_category_id_fkey", "medicines", type_="foreignkey")
    op.drop_index("ix_medicines_product_type", "medicines")
    op.drop_index("ix_medicines_sku", "medicines")
    op.drop_column("medicines", "sku")
    op.drop_column("medicines", "subcategory_id")
    op.drop_column("medicines", "category_id")
    op.drop_column("medicines", "product_type")
    op.drop_table("product_subcategories")
    op.drop_table("product_categories")
