import uuid
from datetime import date, datetime
from decimal import Decimal

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Batches
# ---------------------------------------------------------------------------

class MedicineBatchCreate(BaseModel):
    batch_number: str | None = None
    expiry_date: date
    quantity: int = Field(gt=0)
    purchase_price: Decimal = Field(ge=0)
    supplier_id: uuid.UUID | None = None


class MedicineBatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    medicine_id: uuid.UUID
    batch_number: str | None
    expiry_date: date
    quantity: int
    purchase_price: Decimal
    supplier_id: uuid.UUID | None


# ---------------------------------------------------------------------------
# Drug Family
# ---------------------------------------------------------------------------

class DrugFamilyCreate(BaseModel):
    name_en: str = Field(min_length=2, max_length=150)
    name_ar: str = Field(min_length=2, max_length=150)
    code: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool = True


class DrugFamilyUpdate(BaseModel):
    name_en: str | None = Field(default=None, min_length=2, max_length=150)
    name_ar: str | None = Field(default=None, min_length=2, max_length=150)
    code: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class DrugFamilyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_en: str
    name_ar: str
    code: str | None
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Dosage Form
# ---------------------------------------------------------------------------

class DosageFormCreate(BaseModel):
    name_en: str = Field(min_length=2, max_length=100)
    name_ar: str = Field(min_length=2, max_length=100)
    code: str | None = Field(default=None, max_length=50)
    category: str | None = Field(default=None, max_length=100)
    subtype: str | None = Field(default=None, max_length=100)
    is_active: bool = True


class DosageFormUpdate(BaseModel):
    name_en: str | None = Field(default=None, min_length=2, max_length=100)
    name_ar: str | None = Field(default=None, min_length=2, max_length=100)
    code: str | None = Field(default=None, max_length=50)
    category: str | None = Field(default=None, max_length=100)
    subtype: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None


class DosageFormOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_en: str
    name_ar: str
    code: str | None
    category: str | None = None
    subtype: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Product Categories & Subcategories (General Merchandise & Classification)
# ---------------------------------------------------------------------------

class ProductSubcategoryCreate(BaseModel):
    category_id: uuid.UUID
    name_en: str = Field(min_length=2, max_length=150)
    name_ar: str = Field(min_length=2, max_length=150)
    code: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool = True


class ProductSubcategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID
    name_en: str
    name_ar: str
    code: str | None = None
    description: str | None = None
    is_active: bool


class ProductCategoryCreate(BaseModel):
    name_en: str = Field(min_length=2, max_length=150)
    name_ar: str = Field(min_length=2, max_length=150)
    code: str = Field(min_length=2, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool = True


class ProductCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_en: str
    name_ar: str
    code: str
    description: str | None = None
    is_active: bool
    subcategories: list[ProductSubcategoryOut] = []


# ---------------------------------------------------------------------------
# Active Ingredients
# ---------------------------------------------------------------------------

class ActiveIngredientCreate(BaseModel):
    name_en: str = Field(min_length=2, max_length=200)
    name_ar: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool = True


class ActiveIngredientUpdate(BaseModel):
    name_en: str | None = Field(default=None, min_length=2, max_length=200)
    name_ar: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class ActiveIngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_en: str
    name_ar: str | None
    normalized_name: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MedicineActiveIngredientItem(BaseModel):
    active_ingredient_id: uuid.UUID
    strength_value: Decimal | None = None
    strength_unit: str | None = Field(default=None, max_length=30)
    display_strength: str | None = Field(default=None, max_length=100)


class MedicineActiveIngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    active_ingredient_id: uuid.UUID
    active_ingredient: ActiveIngredientOut | None = None
    strength_value: Decimal | None
    strength_unit: str | None
    display_strength: str | None


# ---------------------------------------------------------------------------
# Medicine Package Units
# ---------------------------------------------------------------------------

class MedicinePackageUnitItem(BaseModel):
    unit_name_en: str = Field(min_length=1, max_length=50)
    unit_name_ar: str = Field(min_length=1, max_length=50)
    conversion_factor: Decimal = Field(gt=Decimal("0"))
    selling_price: Decimal = Field(ge=Decimal("0"))
    purchase_price: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    barcode: str | None = Field(default=None, max_length=64)
    is_base_unit: bool = False
    is_default_dispense: bool = False
    allow_selling: bool = True
    is_active: bool = True


class MedicinePackageUnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    medicine_id: uuid.UUID
    unit_name_en: str
    unit_name_ar: str
    conversion_factor: Decimal
    selling_price: Decimal
    purchase_price: Decimal
    barcode: str | None
    is_base_unit: bool
    is_default_dispense: bool
    allow_selling: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Medicine Master
# ---------------------------------------------------------------------------

VALID_CONTROLLED_SCHEDULES = {
    "schedule_1",            # Schedule I (Narcotics / Stupefiants) - جدول 1 مخدرات
    "schedule_2",            # Schedule II (Psychotropics / Controlled) - جدول 2 مؤثرات عقلية
    "schedule_3",            # Schedule III (Prescription Only / Restricted) - جدول 3 تذاكر خاصة
    "unscheduled_controlled" # Special Controlled / Other Restricted - مراقبة خاصة أخرى
}


class MedicineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    name_ar: str | None = Field(default=None, max_length=200)
    generic_name: str | None = Field(default=None, max_length=200)
    barcode: str | None = Field(default=None, max_length=64)
    manufacturer: str | None = Field(default=None, max_length=150)
    category: str | None = Field(default=None, max_length=100)
    dosage: str | None = Field(default=None, max_length=50)
    form: str | None = Field(default=None, max_length=50)

    drug_family_id: uuid.UUID | None = None
    dosage_form_id: uuid.UUID | None = None
    strength: str | None = Field(default=None, max_length=100)
    base_unit_name: str = Field(default="Unit", max_length=50)

    # Product Classification (Phase 5)
    product_type: str = Field(default="medicine", max_length=50)
    category_id: uuid.UUID | None = None
    subcategory_id: uuid.UUID | None = None
    sku: str | None = Field(default=None, max_length=64)

    selling_price: Decimal = Field(ge=Decimal("0"))
    purchase_price: Decimal = Field(ge=Decimal("0"))
    minimum_stock: int = Field(default=10, ge=0)
    requires_prescription: bool = False

    # Controlled / Scheduled Medicines Classification
    is_controlled: bool = False
    controlled_schedule: str | None = Field(default=None, max_length=50)

    active_ingredients: list[MedicineActiveIngredientItem] | None = None
    package_units: list[MedicinePackageUnitItem] | None = None

    @field_validator(
        "drug_family_id",
        "dosage_form_id",
        "category_id",
        "subcategory_id",
        "controlled_schedule",
        "barcode",
        "manufacturer",
        "category",
        "dosage",
        "form",
        "strength",
        "sku",
        mode="before",
    )
    @classmethod
    def empty_string_to_none(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        return v

    @model_validator(mode="after")
    def validate_controlled_medicine(self) -> "MedicineCreate":
        if self.is_controlled:
            if not self.controlled_schedule:
                raise ValueError("Controlled medicines require a valid controlled schedule classification")
            if self.controlled_schedule not in VALID_CONTROLLED_SCHEDULES:
                raise ValueError(
                    f"Invalid controlled schedule: '{self.controlled_schedule}'. Must be one of: {sorted(VALID_CONTROLLED_SCHEDULES)}"
                )
        else:
            self.controlled_schedule = None
        return self


class MedicineUpdate(BaseModel):
    """PATCH semantics — only supplied fields change."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    name_ar: str | None = Field(default=None, max_length=200)
    generic_name: str | None = Field(default=None, max_length=200)
    barcode: str | None = Field(default=None, max_length=64)
    manufacturer: str | None = Field(default=None, max_length=150)
    category: str | None = Field(default=None, max_length=100)
    dosage: str | None = Field(default=None, max_length=50)
    form: str | None = Field(default=None, max_length=50)

    drug_family_id: uuid.UUID | None = None
    dosage_form_id: uuid.UUID | None = None
    strength: str | None = Field(default=None, max_length=100)
    base_unit_name: str | None = Field(default=None, max_length=50)

    # Product Classification (Phase 5)
    product_type: str | None = Field(default=None, max_length=50)
    category_id: uuid.UUID | None = None
    subcategory_id: uuid.UUID | None = None
    sku: str | None = Field(default=None, max_length=64)

    selling_price: Decimal | None = Field(default=None, ge=Decimal("0"))
    purchase_price: Decimal | None = Field(default=None, ge=Decimal("0"))
    minimum_stock: int | None = Field(default=None, ge=0)
    requires_prescription: bool | None = None
    is_active: bool | None = None

    # Controlled / Scheduled Medicines Classification
    is_controlled: bool | None = None
    controlled_schedule: str | None = Field(default=None, max_length=50)

    active_ingredients: list[MedicineActiveIngredientItem] | None = None
    package_units: list[MedicinePackageUnitItem] | None = None

    @field_validator(
        "drug_family_id",
        "dosage_form_id",
        "category_id",
        "subcategory_id",
        "controlled_schedule",
        "barcode",
        "manufacturer",
        "category",
        "dosage",
        "form",
        "strength",
        "sku",
        mode="before",
    )
    @classmethod
    def empty_string_to_none(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        return v

    @model_validator(mode="after")
    def validate_controlled_medicine_update(self) -> "MedicineUpdate":
        if self.is_controlled is True:
            if self.controlled_schedule is not None and self.controlled_schedule not in VALID_CONTROLLED_SCHEDULES:
                raise ValueError(
                    f"Invalid controlled schedule: '{self.controlled_schedule}'. Must be one of: {sorted(VALID_CONTROLLED_SCHEDULES)}"
                )
        elif self.is_controlled is False:
            self.controlled_schedule = None
        return self


class MedicineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    name_ar: str | None = None
    generic_name: str | None = None
    barcode: str | None = None
    manufacturer: str | None = None
    category: str | None = None
    dosage: str | None = None
    form: str | None = None

    drug_family_id: uuid.UUID | None = None
    drug_family: DrugFamilyOut | None = None
    dosage_form_id: uuid.UUID | None = None
    dosage_form: DosageFormOut | None = None
    strength: str | None = None
    base_unit_name: str = "Unit"

    # Product Classification (Phase 5)
    product_type: str = "medicine"
    category_id: uuid.UUID | None = None
    category_rel: ProductCategoryOut | None = None
    subcategory_id: uuid.UUID | None = None
    subcategory_rel: ProductSubcategoryOut | None = None
    sku: str | None = None

    selling_price: Decimal
    purchase_price: Decimal
    minimum_stock: int
    requires_prescription: bool
    is_controlled: bool = False
    controlled_schedule: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    active_ingredients: list[MedicineActiveIngredientOut] = []
    package_units: list[MedicinePackageUnitOut] = []


class MedicineWithStock(MedicineOut):
    total_stock: int


class MedicineScanResult(BaseModel):
    """What POS scanner returns: medicine with stock, FEFO batches, and matched selling unit."""

    medicine: MedicineOut
    total_stock: int
    batches_fefo: list[MedicineBatchOut]
    matched_unit: MedicinePackageUnitOut | None = None
