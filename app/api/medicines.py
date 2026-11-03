import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.inventory_movement import MovementReason
from app.models.medicine import (
    Medicine,
    MedicineBatch,
    DrugFamily,
    DosageForm,
    ActiveIngredient,
    MedicineActiveIngredient,
    MedicinePackageUnit,
    ProductCategory,
    ProductSubcategory,
)
from app.models.user import User, UserRole
from app.schemas.inventory import ExpiringBatchItem, LowStockItem
from app.schemas.medicine import (
    VALID_CONTROLLED_SCHEDULES,
    DrugFamilyCreate,
    DrugFamilyUpdate,
    DrugFamilyOut,
    DosageFormCreate,
    DosageFormUpdate,
    DosageFormOut,
    ActiveIngredientCreate,
    ActiveIngredientUpdate,
    ActiveIngredientOut,
    ProductCategoryCreate,
    ProductCategoryOut,
    ProductSubcategoryCreate,
    ProductSubcategoryOut,
    MedicineBatchCreate,
    MedicineBatchOut,
    MedicineCreate,
    MedicineOut,
    MedicineScanResult,
    MedicineUpdate,
    MedicineWithStock,
    MedicinePackageUnitOut,
)
from app.services import inventory as inventory_service
from app.services import medicine_master as master_service

router = APIRouter(prefix="/medicines", tags=["medicines"])

CAN_MANAGE = (UserRole.ADMIN, UserRole.PHARMACIST, UserRole.INVENTORY_MANAGER)


def _get_medicine_or_404(db: Session, medicine_id: uuid.UUID) -> Medicine:
    medicine = db.scalar(
        select(Medicine)
        .options(
            selectinload(Medicine.drug_family),
            selectinload(Medicine.dosage_form),
            selectinload(Medicine.active_ingredients).selectinload(MedicineActiveIngredient.active_ingredient),
            selectinload(Medicine.package_units),
            selectinload(Medicine.category_rel),
            selectinload(Medicine.subcategory_rel),
        )
        .where(Medicine.id == medicine_id)
    )
    if medicine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found")
    return medicine


# Columns that are NOT NULL in the database: an explicit null from a client is ignored
# instead of crashing with a 500 at commit time.
_NON_NULLABLE_FIELDS = {
    "name",
    "base_unit_name",
    "product_type",
    "selling_price",
    "purchase_price",
    "minimum_stock",
    "requires_prescription",
    "is_controlled",
    "is_active",
}


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _validate_references(db: Session, data: dict, current: Medicine | None = None) -> None:
    """Make sure referenced master-data rows exist (clean 400 instead of an FK 500)."""
    if data.get("drug_family_id") and db.get(DrugFamily, data["drug_family_id"]) is None:
        raise _bad_request("Drug family not found")
    if data.get("dosage_form_id") and db.get(DosageForm, data["dosage_form_id"]) is None:
        raise _bad_request("Dosage form not found")

    category_id = data.get("category_id")
    if category_id and db.get(ProductCategory, category_id) is None:
        raise _bad_request("Product category not found")

    subcategory_id = data.get("subcategory_id")
    if subcategory_id:
        sub = db.get(ProductSubcategory, subcategory_id)
        if sub is None:
            raise _bad_request("Product subcategory not found")
        effective_category = (
            data["category_id"] if "category_id" in data else (current.category_id if current else None)
        )
        if effective_category and sub.category_id != effective_category:
            raise _bad_request("Subcategory does not belong to the selected category")


def _check_controlled(is_controlled: bool, schedule: str | None) -> None:
    if is_controlled:
        if not schedule:
            raise _bad_request("Controlled medicines require a controlled schedule")
        if schedule not in VALID_CONTROLLED_SCHEDULES:
            raise _bad_request(
                f"Invalid controlled schedule. Must be one of: {sorted(VALID_CONTROLLED_SCHEDULES)}"
            )


# ---------------------------------------------------------------------------
# Master Data Endpoints: Drug Families, Dosage Forms, Active Ingredients
# ---------------------------------------------------------------------------

@router.get("/drug-families", response_model=list[DrugFamilyOut])
def get_drug_families(
    active_only: bool = True,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return master_service.list_drug_families(db, active_only=active_only)


@router.post(
    "/drug-families",
    response_model=DrugFamilyOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def add_drug_family(payload: DrugFamilyCreate, db: Session = Depends(get_db)):
    return master_service.create_drug_family(db, payload)


@router.patch(
    "/drug-families/{family_id}",
    response_model=DrugFamilyOut,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def edit_drug_family(family_id: uuid.UUID, payload: DrugFamilyUpdate, db: Session = Depends(get_db)):
    return master_service.update_drug_family(db, family_id, payload)


@router.get("/dosage-forms", response_model=list[DosageFormOut])
def get_dosage_forms(
    category: str | None = Query(None, description="Filter by dosage form category"),
    subtype: str | None = Query(None, description="Filter by dosage form subtype"),
    active_only: bool = True,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return master_service.list_dosage_forms(db, active_only=active_only, category=category, subtype=subtype)


@router.post(
    "/dosage-forms",
    response_model=DosageFormOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def add_dosage_form(payload: DosageFormCreate, db: Session = Depends(get_db)):
    return master_service.create_dosage_form(db, payload)


@router.patch(
    "/dosage-forms/{form_id}",
    response_model=DosageFormOut,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def edit_dosage_form(form_id: uuid.UUID, payload: DosageFormUpdate, db: Session = Depends(get_db)):
    return master_service.update_dosage_form(db, form_id, payload)


@router.get("/active-ingredients", response_model=list[ActiveIngredientOut])
def get_active_ingredients(
    q: str | None = Query(None, description="Search ingredients by English or Arabic name"),
    active_only: bool = True,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return master_service.list_active_ingredients(db, q=q, active_only=active_only, limit=limit)


@router.post(
    "/active-ingredients",
    response_model=ActiveIngredientOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def add_active_ingredient(payload: ActiveIngredientCreate, db: Session = Depends(get_db)):
    return master_service.create_active_ingredient(db, payload)


@router.patch(
    "/active-ingredients/{ingredient_id}",
    response_model=ActiveIngredientOut,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def edit_active_ingredient(
    ingredient_id: uuid.UUID, payload: ActiveIngredientUpdate, db: Session = Depends(get_db)
):
    return master_service.update_active_ingredient(db, ingredient_id, payload)


# ---------------------------------------------------------------------------
# Product Categories & Subcategories (General Merchandise Classification)
# ---------------------------------------------------------------------------

@router.get("/categories", response_model=list[ProductCategoryOut])
def get_product_categories(
    active_only: bool = True,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return master_service.list_product_categories(db, active_only=active_only)


@router.post(
    "/categories",
    response_model=ProductCategoryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def add_product_category(payload: ProductCategoryCreate, db: Session = Depends(get_db)):
    return master_service.create_product_category(db, payload)


@router.post(
    "/subcategories",
    response_model=ProductSubcategoryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def add_product_subcategory(payload: ProductSubcategoryCreate, db: Session = Depends(get_db)):
    return master_service.create_product_subcategory(db, payload)


# ---------------------------------------------------------------------------
# Medicines Core Catalog
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=MedicineOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def create_medicine(payload: MedicineCreate, db: Session = Depends(get_db)):
    if payload.barcode:
        existing = db.scalar(select(Medicine).where(Medicine.barcode == payload.barcode))
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A medicine or product with this barcode already exists",
            )
    if payload.sku:
        existing_sku = db.scalar(select(Medicine).where(Medicine.sku == payload.sku))
        if existing_sku is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A product with this SKU already exists",
            )

    medicine_data = payload.model_dump(exclude={"active_ingredients", "package_units"})
    _validate_references(db, medicine_data)
    if medicine_data.get("product_type") == "general":
        medicine_data["requires_prescription"] = False

    medicine = Medicine(**medicine_data)
    db.add(medicine)
    db.flush()

    # Sync Active Ingredients (only if provided; not required for general merchandise)
    master_service.validate_and_apply_active_ingredients(db, medicine, payload.active_ingredients)

    # Sync Package Units
    master_service.validate_and_apply_packaging(db, medicine, payload.package_units)

    db.commit()
    return _get_medicine_or_404(db, medicine.id)


@router.get("", response_model=list[MedicineWithStock])
def list_medicines(
    q: str | None = Query(None, description="Search across English/Arabic name, generic, barcode, SKU, or active ingredients"),
    query: str | None = Query(None, description="Alias for q search parameter"),
    product_type: str | None = Query(None, description="Filter by product type: medicine or general"),
    category_id: uuid.UUID | None = Query(None, description="Filter by product category"),
    subcategory_id: uuid.UUID | None = Query(None, description="Filter by product subcategory"),
    family_id: uuid.UUID | None = Query(None, description="Filter by drug family"),
    dosage_form_id: uuid.UUID | None = Query(None, description="Filter by dosage form"),
    active_ingredient_id: uuid.UUID | None = Query(None, description="Filter by active ingredient"),
    manufacturer: str | None = Query(None, description="Filter by manufacturer"),
    requires_prescription: bool | None = Query(None, description="Filter by prescription requirement"),
    is_controlled: bool | None = Query(None, description="Filter by controlled medicine classification"),
    controlled_schedule: str | None = Query(None, description="Filter by specific controlled schedule"),
    stock_status: str | None = Query(None, description="Filter by stock: all, in_stock, low_stock, out_of_stock"),
    category: str | None = Query(None, description="Legacy category filter"),
    active_only: bool = True,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Medicine)
        .options(
            selectinload(Medicine.drug_family),
            selectinload(Medicine.dosage_form),
            selectinload(Medicine.active_ingredients).selectinload(MedicineActiveIngredient.active_ingredient),
            selectinload(Medicine.package_units),
            selectinload(Medicine.category_rel),
            selectinload(Medicine.subcategory_rel),
        )
    )

    if active_only:
        stmt = stmt.where(Medicine.is_active.is_(True))
    if product_type:
        stmt = stmt.where(Medicine.product_type == product_type)
    if category_id:
        stmt = stmt.where(Medicine.category_id == category_id)
    if subcategory_id:
        stmt = stmt.where(Medicine.subcategory_id == subcategory_id)
    if category:
        stmt = stmt.where(Medicine.category == category)
    if family_id:
        stmt = stmt.where(Medicine.drug_family_id == family_id)
    if dosage_form_id:
        stmt = stmt.where(Medicine.dosage_form_id == dosage_form_id)
    if manufacturer:
        stmt = stmt.where(Medicine.manufacturer.ilike(f"%{manufacturer.strip()}%"))
    if requires_prescription is not None:
        stmt = stmt.where(Medicine.requires_prescription == requires_prescription)
    if is_controlled is not None:
        stmt = stmt.where(Medicine.is_controlled == is_controlled)
    if controlled_schedule:
        stmt = stmt.where(Medicine.controlled_schedule == controlled_schedule)

    if active_ingredient_id:
        stmt = stmt.where(
            Medicine.id.in_(
                select(MedicineActiveIngredient.medicine_id).where(
                    MedicineActiveIngredient.active_ingredient_id == active_ingredient_id
                )
            )
        )

    # Stock filter is applied in SQL (before pagination) so pages are complete
    if stock_status in ("out_of_stock", "in_stock", "low_stock"):
        stock_sq = (
            select(
                MedicineBatch.medicine_id.label("medicine_id"),
                func.sum(MedicineBatch.quantity).label("qty"),
            )
            .group_by(MedicineBatch.medicine_id)
            .subquery()
        )
        total_expr = func.coalesce(stock_sq.c.qty, 0)
        stmt = stmt.outerjoin(stock_sq, stock_sq.c.medicine_id == Medicine.id)
        if stock_status == "out_of_stock":
            stmt = stmt.where(total_expr <= 0)
        elif stock_status == "in_stock":
            stmt = stmt.where(total_expr > 0)
        else:
            stmt = stmt.where(total_expr <= Medicine.minimum_stock)

    search_term = (q or query or "").strip()
    if search_term:
        like = f"%{search_term}%"
        # Search name, name_ar, generic_name, sku, medicine barcode, package unit barcodes, and ingredient names
        stmt = stmt.where(
            or_(
                Medicine.name.ilike(like),
                Medicine.name_ar.ilike(like),
                Medicine.generic_name.ilike(like),
                Medicine.barcode.ilike(like),
                Medicine.sku.ilike(like),
                Medicine.id.in_(
                    select(MedicinePackageUnit.medicine_id).where(MedicinePackageUnit.barcode.ilike(like))
                ),
                Medicine.id.in_(
                    select(MedicineActiveIngredient.medicine_id)
                    .join(ActiveIngredient, ActiveIngredient.id == MedicineActiveIngredient.active_ingredient_id)
                    .where(
                        or_(
                            ActiveIngredient.name_en.ilike(like),
                            ActiveIngredient.name_ar.ilike(like),
                            ActiveIngredient.normalized_name.ilike(like),
                        )
                    )
                ),
            )
        )

    stmt = stmt.order_by(Medicine.name).offset(offset).limit(limit)
    medicines = db.scalars(stmt).unique().all()

    results: list[MedicineWithStock] = []
    for m in medicines:
        total_stock = inventory_service.get_total_stock(db, m.id)

        results.append(
            MedicineWithStock(
                **MedicineOut.model_validate(m).model_dump(),
                total_stock=total_stock,
            )
        )

    return results


@router.get("/low-stock", response_model=list[LowStockItem])
def low_stock(
    db: Session = Depends(get_db), _current_user: User = Depends(get_current_user)
):
    return inventory_service.get_low_stock_medicines(db)


@router.get("/expiring", response_model=list[ExpiringBatchItem])
def expiring_soon(
    within_days: int | None = Query(None, description="Override default expiry warning window (days)"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    return inventory_service.get_expiring_batches(db, within_days=within_days)


@router.get("/barcode/{barcode}", response_model=MedicineScanResult)
def scan_barcode(
    barcode: str, db: Session = Depends(get_db), _current_user: User = Depends(get_current_user)
):
    """
    POS barcode scan flow:
    1. Check medicines.barcode
    2. Check medicine_package_units.barcode
    Returns medicine, total base stock, FEFO batches, and matched_unit.
    """
    matched_unit: MedicinePackageUnit | None = None
    barcode_clean = barcode.strip()

    # Check unit barcode first for package-specific identification
    unit_match = db.scalar(
        select(MedicinePackageUnit)
        .where(MedicinePackageUnit.barcode == barcode_clean, MedicinePackageUnit.is_active.is_(True))
    )

    if unit_match is not None:
        matched_unit = unit_match
        medicine = _get_medicine_or_404(db, unit_match.medicine_id)
    else:
        # Check primary medicine barcode or SKU
        medicine_rec = db.scalar(
            select(Medicine).where(
                or_(
                    Medicine.barcode == barcode_clean,
                    Medicine.sku == barcode_clean,
                )
            )
        )
        if medicine_rec is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="No medicine found for this barcode"
            )
        medicine = _get_medicine_or_404(db, medicine_rec.id)
        # Identify default dispense package unit if exists
        matched_unit = next(
            (u for u in medicine.package_units if u.is_default_dispense and u.is_active and u.allow_selling),
            next((u for u in medicine.package_units if u.is_base_unit and u.is_active and u.allow_selling), None),
        )

    batches = inventory_service.get_fefo_batches(db, medicine.id)
    return MedicineScanResult(
        medicine=MedicineOut.model_validate(medicine),
        total_stock=sum(b.quantity for b in batches),
        batches_fefo=[MedicineBatchOut.model_validate(b) for b in batches],
        matched_unit=MedicinePackageUnitOut.model_validate(matched_unit) if matched_unit else None,
    )


@router.get("/{medicine_id}", response_model=MedicineWithStock)
def get_medicine(
    medicine_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    medicine = _get_medicine_or_404(db, medicine_id)
    return MedicineWithStock(
        **MedicineOut.model_validate(medicine).model_dump(),
        total_stock=inventory_service.get_total_stock(db, medicine.id),
    )


@router.patch(
    "/{medicine_id}",
    response_model=MedicineOut,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def update_medicine(
    medicine_id: uuid.UUID, payload: MedicineUpdate, db: Session = Depends(get_db)
):
    medicine = _get_medicine_or_404(db, medicine_id)

    changes = payload.model_dump(exclude_unset=True, exclude={"active_ingredients", "package_units"})
    if "barcode" in changes and changes["barcode"]:
        clash = db.scalar(
            select(Medicine).where(
                Medicine.barcode == changes["barcode"], Medicine.id != medicine_id
            )
        )
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another medicine already uses this barcode",
            )

    if "sku" in changes and changes["sku"]:
        clash_sku = db.scalar(
            select(Medicine).where(
                Medicine.sku == changes["sku"], Medicine.id != medicine_id
            )
        )
        if clash_sku is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another product already uses this SKU",
            )

    # Ignore explicit nulls for NOT NULL columns (would otherwise fail at commit with a 500)
    changes = {k: v for k, v in changes.items() if not (k in _NON_NULLABLE_FIELDS and v is None)}

    _validate_references(db, changes, current=medicine)

    # Validate the controlled classification against the merged (existing + incoming) state
    merged_controlled = changes.get("is_controlled", medicine.is_controlled)
    merged_schedule = changes.get("controlled_schedule", medicine.controlled_schedule)
    _check_controlled(bool(merged_controlled), merged_schedule)
    if not merged_controlled:
        changes["controlled_schedule"] = None

    if changes.get("product_type") == "general":
        changes["requires_prescription"] = False

    for field, value in changes.items():
        setattr(medicine, field, value)

    # Sync Active Ingredients if provided
    if payload.active_ingredients is not None:
        master_service.validate_and_apply_active_ingredients(db, medicine, payload.active_ingredients)

    # Sync Package Units if provided
    if payload.package_units is not None:
        master_service.validate_and_apply_packaging(db, medicine, payload.package_units)

    db.commit()
    return _get_medicine_or_404(db, medicine.id)


@router.delete(
    "/{medicine_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def deactivate_medicine(medicine_id: uuid.UUID, db: Session = Depends(get_db)):
    medicine = _get_medicine_or_404(db, medicine_id)
    medicine.is_active = False
    db.commit()


# --- Batches -----------------------------------------------------------

@router.post(
    "/{medicine_id}/batches",
    response_model=MedicineBatchOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def add_batch(
    medicine_id: uuid.UUID,
    payload: MedicineBatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_medicine_or_404(db, medicine_id)

    batch = MedicineBatch(medicine_id=medicine_id, **payload.model_dump())
    db.add(batch)
    db.flush()

    inventory_service.record_movement(
        db,
        medicine_id=medicine_id,
        batch_id=batch.id,
        quantity_change=batch.quantity,
        reason=MovementReason.PURCHASE_RECEIVED,
        reference_type="manual_batch_entry",
        reference_id=batch.id,
        created_by=current_user.id,
    )

    db.commit()
    db.refresh(batch)
    return batch


@router.get("/{medicine_id}/batches", response_model=list[MedicineBatchOut])
def list_batches(
    medicine_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    _get_medicine_or_404(db, medicine_id)
    return db.scalars(
        select(MedicineBatch)
        .where(MedicineBatch.medicine_id == medicine_id)
        .order_by(MedicineBatch.expiry_date.asc())
    ).all()
