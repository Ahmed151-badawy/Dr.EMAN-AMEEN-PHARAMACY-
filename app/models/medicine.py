import uuid
from datetime import date

from sqlalchemy import (
    String,
    Numeric,
    Integer,
    Boolean,
    ForeignKey,
    Date,
    CheckConstraint,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class ProductCategory(Base, TimestampMixin):
    """
    General pharmacy and merchandise categories (e.g., Medicines, Baby Care, Skincare, Feminine Care).
    """

    __tablename__ = "product_categories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name_en: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name_ar: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    subcategories: Mapped[list["ProductSubcategory"]] = relationship(
        back_populates="category", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ProductCategory {self.name_en} / {self.name_ar}>"


class ProductSubcategory(Base, TimestampMixin):
    """
    Subcategories within a product category (e.g. Baby Diapers, Sanitary Pads, Shampoo).
    """

    __tablename__ = "product_subcategories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    category: Mapped["ProductCategory"] = relationship(back_populates="subcategories")

    __table_args__ = (
        UniqueConstraint("category_id", "code", name="uq_subcategory_category_code"),
    )

    def __repr__(self) -> str:
        return f"<ProductSubcategory {self.name_en} / {self.name_ar}>"


class DrugFamily(Base, TimestampMixin):
    """
    Therapeutic / Pharmacological drug family.
    Examples: Analgesics, Antibiotics, Antihypertensives, Antidiabetics, etc.
    """

    __tablename__ = "drug_families"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name_en: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    name_ar: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    code: Mapped[str | None] = mapped_column(String(50), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    medicines: Mapped[list["Medicine"]] = relationship(back_populates="drug_family")

    def __repr__(self) -> str:
        return f"<DrugFamily {self.name_en} / {self.name_ar}>"


class DosageForm(Base, TimestampMixin):
    """
    Standard pharmaceutical dosage forms and subtypes.
    Examples: Uncoated tablet, Film-coated tablet, Rectal suppository, Eye drops, Ampoule.
    """

    __tablename__ = "dosage_forms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name_en: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name_ar: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    code: Mapped[str | None] = mapped_column(String(50), unique=True, index=True)
    category: Mapped[str | None] = mapped_column(String(50), index=True)  # Solid oral, Injectable, etc.
    subtype: Mapped[str | None] = mapped_column(String(100), index=True)   # Film-coated, Enteric, etc.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    medicines: Mapped[list["Medicine"]] = relationship(back_populates="dosage_form")

    def __repr__(self) -> str:
        return f"<DosageForm {self.name_en} / {self.name_ar}>"


class ActiveIngredient(Base, TimestampMixin):
    """
    Normalized chemical entity / active substance (المادة الفعالة).
    Examples: Paracetamol, Caffeine, Amoxicillin, Clavulanic Acid.
    """

    __tablename__ = "active_ingredients"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name_en: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    name_ar: Mapped[str | None] = mapped_column(String(200), index=True)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<ActiveIngredient {self.name_en}>"


class MedicineActiveIngredient(Base, TimestampMixin):
    """
    Many-to-Many junction between Medicine and ActiveIngredient with ingredient-specific strength.
    Allows multi-active ingredient formulations (e.g. Augmentin: Amoxicillin 875mg + Clavulanic Acid 125mg).
    """

    __tablename__ = "medicine_active_ingredients"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    active_ingredient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("active_ingredients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    strength_value: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    strength_unit: Mapped[str | None] = mapped_column(String(30), nullable=True)  # mg, g, mcg, ml, %, IU, mg/5ml
    display_strength: Mapped[str | None] = mapped_column(String(100), nullable=True)

    medicine: Mapped["Medicine"] = relationship(back_populates="active_ingredients")
    active_ingredient: Mapped["ActiveIngredient"] = relationship()

    __table_args__ = (
        UniqueConstraint("medicine_id", "active_ingredient_id", name="uq_medicine_active_ingredient"),
    )

    def __repr__(self) -> str:
        return f"<MedicineActiveIngredient med={self.medicine_id} ing={self.active_ingredient_id}>"


class MedicinePackageUnit(Base, TimestampMixin):
    """
    Packaging and selling units for a medicine (e.g. Box, Strip, Tablet, Bottle).
    Stores conversion_factor to base units and unit-specific selling price and barcode.
    """

    __tablename__ = "medicine_package_units"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    unit_name_en: Mapped[str] = mapped_column(String(50), nullable=False)
    unit_name_ar: Mapped[str] = mapped_column(String(50), nullable=False)
    conversion_factor: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=1.0)
    selling_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    purchase_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    barcode: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    is_base_unit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_default_dispense: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    allow_selling: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    medicine: Mapped["Medicine"] = relationship(back_populates="package_units")

    __table_args__ = (
        CheckConstraint("conversion_factor > 0", name="ck_pkg_conversion_factor_positive"),
        CheckConstraint("selling_price >= 0", name="ck_pkg_selling_price_nonneg"),
        CheckConstraint("purchase_price >= 0", name="ck_pkg_purchase_price_nonneg"),
        UniqueConstraint("medicine_id", "unit_name_en", name="uq_medicine_unit_name_en"),
        Index(
            "uq_medicine_base_unit",
            "medicine_id",
            unique=True,
            postgresql_where=(is_base_unit == True),
        ),
    )

    def __repr__(self) -> str:
        return f"<MedicinePackageUnit {self.unit_name_en} x{self.conversion_factor}>"


class Medicine(Base, TimestampMixin):
    """
    Catalog record for a medicine with pharmaceutical metadata and packaging hierarchy.
    Physical stock is maintained in base units across MedicineBatch rows.
    """

    __tablename__ = "medicines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    name_ar: Mapped[str | None] = mapped_column(String(200), index=True)
    generic_name: Mapped[str | None] = mapped_column(String(200), index=True)
    barcode: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    manufacturer: Mapped[str | None] = mapped_column(String(150))
    category: Mapped[str | None] = mapped_column(String(100), index=True)
    dosage: Mapped[str | None] = mapped_column(String(50))
    form: Mapped[str | None] = mapped_column(String(50))  # tablet, syrup, injection, etc.

    drug_family_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drug_families.id", ondelete="SET NULL")
    )
    dosage_form_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dosage_forms.id", ondelete="SET NULL")
    )
    strength: Mapped[str | None] = mapped_column(String(100))
    base_unit_name: Mapped[str] = mapped_column(String(50), nullable=False, default="Unit")

    selling_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    purchase_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

    minimum_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    requires_prescription: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_controlled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    controlled_schedule: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    product_type: Mapped[str] = mapped_column(String(50), nullable=False, default="medicine", index=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_categories.id", ondelete="SET NULL")
    )
    subcategory_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_subcategories.id", ondelete="SET NULL")
    )
    sku: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)

    drug_family: Mapped["DrugFamily | None"] = relationship(back_populates="medicines")
    dosage_form: Mapped["DosageForm | None"] = relationship(back_populates="medicines")
    category_rel: Mapped["ProductCategory | None"] = relationship(foreign_keys=[category_id])
    subcategory_rel: Mapped["ProductSubcategory | None"] = relationship(foreign_keys=[subcategory_id])
    active_ingredients: Mapped[list["MedicineActiveIngredient"]] = relationship(
        back_populates="medicine", cascade="all, delete-orphan"
    )
    package_units: Mapped[list["MedicinePackageUnit"]] = relationship(
        back_populates="medicine", cascade="all, delete-orphan"
    )
    batches: Mapped[list["MedicineBatch"]] = relationship(
        back_populates="medicine", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("selling_price >= 0", name="ck_medicine_selling_price_nonneg"),
        CheckConstraint("purchase_price >= 0", name="ck_medicine_purchase_price_nonneg"),
        CheckConstraint("minimum_stock >= 0", name="ck_medicine_min_stock_nonneg"),
    )

    def __repr__(self) -> str:
        return f"<Medicine {self.name}>"


class MedicineBatch(Base, TimestampMixin):
    """
    Shipment/lot of a medicine tracked in base units with its own expiry date, quantity,
    and purchase cost per base unit. Stock is always tracked at the batch level.
    """

    __tablename__ = "medicine_batches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False
    )
    batch_number: Mapped[str | None] = mapped_column(String(100))
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    purchase_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="SET NULL")
    )

    medicine: Mapped["Medicine"] = relationship(back_populates="batches")

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_batch_quantity_nonneg"),
        CheckConstraint("purchase_price >= 0", name="ck_batch_purchase_price_nonneg"),
    )

    def __repr__(self) -> str:
        return f"<MedicineBatch {self.batch_number} exp={self.expiry_date} qty={self.quantity}>"
