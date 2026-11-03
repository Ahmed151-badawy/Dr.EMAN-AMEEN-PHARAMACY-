import re
import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session, selectinload

from app.models.medicine import (
    Medicine,
    DrugFamily,
    DosageForm,
    ActiveIngredient,
    MedicineActiveIngredient,
    MedicinePackageUnit,
    ProductCategory,
    ProductSubcategory,
)
from app.schemas.medicine import (
    DrugFamilyCreate,
    DrugFamilyUpdate,
    DosageFormCreate,
    DosageFormUpdate,
    ActiveIngredientCreate,
    ActiveIngredientUpdate,
    ProductCategoryCreate,
    ProductSubcategoryCreate,
    MedicinePackageUnitItem,
    MedicineActiveIngredientItem,
)


def normalize_ingredient_name(name: str) -> str:
    """Normalize ingredient name for tolerant search and deduplication."""
    return re.sub(r"\s+", " ", name.strip().lower())


# ---------------------------------------------------------------------------
# Drug Families
# ---------------------------------------------------------------------------

def list_drug_families(db: Session, active_only: bool = True) -> list[DrugFamily]:
    stmt = select(DrugFamily)
    if active_only:
        stmt = stmt.where(DrugFamily.is_active.is_(True))
    return list(db.scalars(stmt.order_by(DrugFamily.name_en)).all())


def create_drug_family(db: Session, payload: DrugFamilyCreate) -> DrugFamily:
    if payload.code:
        existing = db.scalar(select(DrugFamily).where(DrugFamily.code == payload.code))
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Drug family with code '{payload.code}' already exists",
            )

    fam = DrugFamily(**payload.model_dump())
    db.add(fam)
    db.commit()
    db.refresh(fam)
    return fam


def update_drug_family(db: Session, family_id: uuid.UUID, payload: DrugFamilyUpdate) -> DrugFamily:
    fam = db.get(DrugFamily, family_id)
    if fam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Drug family not found")

    changes = payload.model_dump(exclude_unset=True)
    if "code" in changes and changes["code"]:
        existing = db.scalar(
            select(DrugFamily).where(DrugFamily.code == changes["code"], DrugFamily.id != family_id)
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Drug family with code '{changes['code']}' already exists",
            )

    for field, val in changes.items():
        setattr(fam, field, val)

    db.commit()
    db.refresh(fam)
    return fam


# ---------------------------------------------------------------------------
# Dosage Forms
# ---------------------------------------------------------------------------

def list_dosage_forms(
    db: Session,
    active_only: bool = True,
    category: str | None = None,
    subtype: str | None = None,
) -> list[DosageForm]:
    stmt = select(DosageForm)
    if active_only:
        stmt = stmt.where(DosageForm.is_active.is_(True))
    if category:
        stmt = stmt.where(DosageForm.category == category)
    if subtype:
        stmt = stmt.where(DosageForm.subtype == subtype)
    return list(db.scalars(stmt.order_by(DosageForm.name_en)).all())


def create_dosage_form(db: Session, payload: DosageFormCreate) -> DosageForm:
    if payload.code:
        existing = db.scalar(select(DosageForm).where(DosageForm.code == payload.code))
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Dosage form with code '{payload.code}' already exists",
            )

    form = DosageForm(**payload.model_dump())
    db.add(form)
    db.commit()
    db.refresh(form)
    return form


def update_dosage_form(db: Session, form_id: uuid.UUID, payload: DosageFormUpdate) -> DosageForm:
    form = db.get(DosageForm, form_id)
    if form is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dosage form not found")

    changes = payload.model_dump(exclude_unset=True)
    if "code" in changes and changes["code"]:
        existing = db.scalar(
            select(DosageForm).where(DosageForm.code == changes["code"], DosageForm.id != form_id)
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Dosage form with code '{changes['code']}' already exists",
            )

    for field, val in changes.items():
        setattr(form, field, val)

    db.commit()
    db.refresh(form)
    return form


# ---------------------------------------------------------------------------
# Product Categories & Subcategories
# ---------------------------------------------------------------------------

def list_product_categories(db: Session, active_only: bool = True) -> list[ProductCategory]:
    stmt = (
        select(ProductCategory)
        .options(selectinload(ProductCategory.subcategories))
        .order_by(ProductCategory.name_en)
    )
    if active_only:
        stmt = stmt.where(ProductCategory.is_active.is_(True))
    return list(db.scalars(stmt).all())


def create_product_category(db: Session, payload: ProductCategoryCreate) -> ProductCategory:
    existing = db.scalar(select(ProductCategory).where(ProductCategory.code == payload.code))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Product category with code '{payload.code}' already exists",
        )

    cat = ProductCategory(**payload.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def create_product_subcategory(db: Session, payload: ProductSubcategoryCreate) -> ProductSubcategory:
    cat = db.get(ProductCategory, payload.category_id)
    if cat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent product category not found",
        )

    if payload.code:
        existing = db.scalar(
            select(ProductSubcategory).where(
                ProductSubcategory.category_id == payload.category_id,
                ProductSubcategory.code == payload.code,
            )
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subcategory with code '{payload.code}' already exists in this category",
            )

    subcat = ProductSubcategory(**payload.model_dump())
    db.add(subcat)
    db.commit()
    db.refresh(subcat)
    return subcat


# ---------------------------------------------------------------------------
# Active Ingredients
# ---------------------------------------------------------------------------

def list_active_ingredients(
    db: Session, q: str | None = None, active_only: bool = True, limit: int = 100
) -> list[ActiveIngredient]:
    stmt = select(ActiveIngredient)
    if active_only:
        stmt = stmt.where(ActiveIngredient.is_active.is_(True))
    if q:
        normalized = normalize_ingredient_name(q)
        like_norm = f"%{normalized}%"
        like_raw = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                ActiveIngredient.normalized_name.ilike(like_norm),
                ActiveIngredient.name_en.ilike(like_raw),
                ActiveIngredient.name_ar.ilike(like_raw),
            )
        )
    return list(db.scalars(stmt.order_by(ActiveIngredient.name_en).limit(limit)).all())


def create_active_ingredient(db: Session, payload: ActiveIngredientCreate) -> ActiveIngredient:
    normalized = normalize_ingredient_name(payload.name_en)
    existing = db.scalar(select(ActiveIngredient).where(ActiveIngredient.normalized_name == normalized))
    if existing is not None:
        return existing  # Idempotent return

    ai = ActiveIngredient(
        name_en=payload.name_en.strip(),
        name_ar=payload.name_ar.strip() if payload.name_ar else None,
        normalized_name=normalized,
        description=payload.description,
        is_active=payload.is_active,
    )
    db.add(ai)
    db.commit()
    db.refresh(ai)
    return ai


def update_active_ingredient(
    db: Session, ingredient_id: uuid.UUID, payload: ActiveIngredientUpdate
) -> ActiveIngredient:
    ai = db.get(ActiveIngredient, ingredient_id)
    if ai is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active ingredient not found")

    changes = payload.model_dump(exclude_unset=True)
    if "name_en" in changes and changes["name_en"]:
        ai.name_en = changes["name_en"].strip()
        ai.normalized_name = normalize_ingredient_name(changes["name_en"])
    if "name_ar" in changes:
        ai.name_ar = changes["name_ar"].strip() if changes["name_ar"] else None
    if "description" in changes:
        ai.description = changes["description"]
    if "is_active" in changes and changes["is_active"] is not None:
        ai.is_active = changes["is_active"]

    db.commit()
    db.refresh(ai)
    return ai


# ---------------------------------------------------------------------------
# Packaging & Multi-Unit Helpers
# ---------------------------------------------------------------------------

def validate_and_apply_packaging(
    db: Session, medicine: Medicine, package_units_data: list[MedicinePackageUnitItem] | None
) -> None:
    """
    Validates and syncs package units for a medicine.
    Ensures:
      - Exactly one base unit exists (is_base_unit=True, conversion_factor=1.0).
      - Conversion factors are strictly positive.
      - Unit barcodes are unique.
    """
    if package_units_data is None:
        # If medicine has no package units at all, ensure at least one base unit
        if not medicine.package_units:
            base_unit = MedicinePackageUnit(
                medicine_id=medicine.id,
                unit_name_en=medicine.base_unit_name or "Unit",
                unit_name_ar="وحدة",
                conversion_factor=Decimal("1.0"),
                selling_price=Decimal(str(medicine.selling_price)),
                purchase_price=Decimal(str(medicine.purchase_price)),
                barcode=None,
                is_base_unit=True,
                is_default_dispense=True,
                allow_selling=True,
                is_active=True,
            )
            db.add(base_unit)
        return

    # Check that at least one unit is supplied
    if not package_units_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A medicine must have at least one packaging unit configured",
        )

    # Check base unit count
    base_units = [u for u in package_units_data if u.is_base_unit]
    if len(base_units) == 0:
        # Default the first or unit with conversion factor 1 to base
        cand = next((u for u in package_units_data if Decimal(str(u.conversion_factor)) == Decimal("1.0")), package_units_data[0])
        cand.is_base_unit = True
        base_units = [cand]

    if len(base_units) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A medicine can have exactly one base unit (is_base_unit=True)",
        )

    # Ensure base unit has conversion factor 1.0
    for u in package_units_data:
        if u.is_base_unit and Decimal(str(u.conversion_factor)) != Decimal("1.0"):
            u.conversion_factor = Decimal("1.0")

    # Stock is stored as whole base units, so every conversion factor must be a whole number
    for u in package_units_data:
        if Decimal(str(u.conversion_factor)) != Decimal(str(u.conversion_factor)).to_integral_value():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Conversion factor for '{u.unit_name_en}' must be a whole number",
            )

    # Check that at least one unit allows selling
    if not any(u.allow_selling for u in package_units_data):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one packaging unit must be enabled for selling",
        )

    # Ensure at most one default dispense unit is selected, or fallback to base unit
    default_units = [u for u in package_units_data if u.is_default_dispense]
    if len(default_units) == 0:
        base_units[0].is_default_dispense = True
    elif len(default_units) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A medicine can have at most one default dispense unit (is_default_dispense=True)",
        )

    # Check if base unit is being switched on an existing medicine with active stock
    old_base_unit = next((u for u in medicine.package_units if u.is_base_unit), None)
    new_base_unit = base_units[0]
    if (
        old_base_unit
        and old_base_unit.unit_name_en.strip().lower() != new_base_unit.unit_name_en.strip().lower()
    ):
        from app.models.medicine import MedicineBatch
        total_batch_stock = db.scalar(
            select(func.coalesce(func.sum(MedicineBatch.quantity), 0)).where(
                MedicineBatch.medicine_id == medicine.id
            )
        ) or 0
        if total_batch_stock > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot change base unit from '{old_base_unit.unit_name_en}' to '{new_base_unit.unit_name_en}' "
                    f"while the product has active batch stock ({total_batch_stock} units). "
                    f"Please write off or adjust existing stock before redefining the base inventory unit."
                ),
            )
        medicine.base_unit_name = new_base_unit.unit_name_en.strip()

    # Check unique barcodes among package units
    barcodes = [u.barcode for u in package_units_data if u.barcode]
    if len(barcodes) != len(set(barcodes)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate barcodes found in packaging configuration",
        )

    # Sync existing package units in place or insert/delete
    existing_by_name = {u.unit_name_en.strip(): u for u in medicine.package_units}
    new_names = {u.unit_name_en.strip() for u in package_units_data}

    # Delete units no longer in payload
    for name, old_unit in list(existing_by_name.items()):
        if name not in new_names:
            db.delete(old_unit)
            existing_by_name.pop(name)

    # Flush deletes first so there are no unique constraint conflicts on insert/update
    db.flush()

    # Update existing or add new
    for u in package_units_data:
        name = u.unit_name_en.strip()
        if name in existing_by_name:
            unit = existing_by_name[name]
            unit.unit_name_ar = u.unit_name_ar.strip()
            unit.conversion_factor = Decimal(str(u.conversion_factor))
            unit.selling_price = Decimal(str(u.selling_price))
            unit.purchase_price = Decimal(str(u.purchase_price))
            unit.barcode = u.barcode.strip() if u.barcode else None
            unit.is_base_unit = u.is_base_unit
            unit.is_default_dispense = u.is_default_dispense
            unit.allow_selling = u.allow_selling
            unit.is_active = u.is_active
        else:
            unit = MedicinePackageUnit(
                medicine_id=medicine.id,
                unit_name_en=name,
                unit_name_ar=u.unit_name_ar.strip(),
                conversion_factor=Decimal(str(u.conversion_factor)),
                selling_price=Decimal(str(u.selling_price)),
                purchase_price=Decimal(str(u.purchase_price)),
                barcode=u.barcode.strip() if u.barcode else None,
                is_base_unit=u.is_base_unit,
                is_default_dispense=u.is_default_dispense,
                allow_selling=u.allow_selling,
                is_active=u.is_active,
            )
            db.add(unit)

    db.flush()


def validate_and_apply_active_ingredients(
    db: Session, medicine: Medicine, ingredients_data: list[MedicineActiveIngredientItem] | None
) -> None:
    """Sync active ingredients for a medicine in place."""
    if ingredients_data is None:
        return

    # Check duplicate ingredients in payload
    ingredient_ids = [item.active_ingredient_id for item in ingredients_data]
    if len(ingredient_ids) != len(set(ingredient_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate active ingredient in medicine configuration",
        )

    existing_by_id = {ai.active_ingredient_id: ai for ai in medicine.active_ingredients}
    new_ids = {item.active_ingredient_id for item in ingredients_data}

    for ing_id, old_item in list(existing_by_id.items()):
        if ing_id not in new_ids:
            db.delete(old_item)
            existing_by_id.pop(ing_id)

    db.flush()

    for item in ingredients_data:
        ai = db.get(ActiveIngredient, item.active_ingredient_id)
        if ai is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Active ingredient {item.active_ingredient_id} not found",
            )
        if item.active_ingredient_id in existing_by_id:
            mai = existing_by_id[item.active_ingredient_id]
            mai.strength_value = Decimal(str(item.strength_value)) if item.strength_value is not None else None
            mai.strength_unit = item.strength_unit.strip() if item.strength_unit else None
            mai.display_strength = item.display_strength.strip() if item.display_strength else None
        else:
            mai = MedicineActiveIngredient(
                medicine_id=medicine.id,
                active_ingredient_id=ai.id,
                strength_value=Decimal(str(item.strength_value)) if item.strength_value is not None else None,
                strength_unit=item.strength_unit.strip() if item.strength_unit else None,
                display_strength=item.display_strength.strip() if item.display_strength else None,
            )
            db.add(mai)

    db.flush()