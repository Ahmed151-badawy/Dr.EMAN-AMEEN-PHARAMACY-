import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


class ImportSummary(BaseModel):
    total_medicines: int = 0
    valid_medicines: int = 0
    flagged_medicines: int = 0
    duplicate_name_candidates: int = 0

    total_batches: int = 0
    valid_batches: int = 0
    quarantined_batches: int = 0
    duplicate_batch_candidates: int = 0
    price_anomalies: int = 0

    status: str = "READY_FOR_PREVIEW"


class MedicinePreviewItem(BaseModel):
    medicine_id: str
    name: str
    name_ar: Optional[str] = None
    generic_name: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    package_description: Optional[str] = None
    barcode: Optional[str] = None
    verification_status: str = "Verified"
    notes: Optional[str] = None
    is_valid: bool = True
    validation_warnings: list[str] = Field(default_factory=list)
    existing_match_id: Optional[uuid.UUID] = None
    existing_match_type: Optional[str] = None


class BatchPreviewItem(BaseModel):
    batch_id: str
    medicine_id: str
    medicine_name: str
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None
    is_expired: bool = False
    is_expiry_unspecified: bool = False
    invoice_quantity: int = 0
    purchase_unit: str = "Pack"
    gross_price: float = 0.0
    discount_percent: float = 0.0
    calculated_unit_cost: float = 0.0
    recorded_net_price: float = 0.0
    expected_net_price: float = 0.0
    price_discrepancy: bool = False
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    supplier_name: str
    normalized_supplier_name: str
    is_valid: bool = True
    is_quarantined: bool = False
    validation_warnings: list[str] = Field(default_factory=list)


class PriceAnomalyItem(BaseModel):
    batch_id: str
    medicine_id: str
    batch_number: Optional[str] = None
    invoice_quantity: int
    purchase_price: float
    discount_percent: float
    recorded_net_price: float
    expected_net_price: float
    invoice_number: Optional[str] = None
    discrepancy_amount: float


class DuplicateBatchItem(BaseModel):
    medicine_id: str
    batch_number: str
    expiry_date: str
    batch_ids: list[str]
    invoice_numbers: list[str]
    total_quantity: int


class DuplicateNameItem(BaseModel):
    matched_by: str
    matched_name: str
    medicine_ids: list[str]
    names: list[str]
    strengths: list[str]
    dosage_forms: list[str]


class QuarantineBatchItem(BaseModel):
    batch_id: str
    medicine_id: str
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None
    reason: str


class ImportPreviewReport(BaseModel):
    session_id: uuid.UUID
    filename: str
    file_hash: str
    uploaded_at: datetime
    summary: ImportSummary
    medicines_preview: list[MedicinePreviewItem] = Field(default_factory=list)
    batches_preview: list[BatchPreviewItem] = Field(default_factory=list)
    price_anomalies: list[PriceAnomalyItem] = Field(default_factory=list)
    duplicate_batches: list[DuplicateBatchItem] = Field(default_factory=list)
    duplicate_names: list[DuplicateNameItem] = Field(default_factory=list)
    quarantined_batches: list[QuarantineBatchItem] = Field(default_factory=list)
    validation_errors: list[str] = Field(default_factory=list)


class ImportCommitRequest(BaseModel):
    session_id: uuid.UUID
    approve_all_verified_medicines: bool = False
    approved_medicine_ids: Optional[list[str]] = None
    approve_all_valid_batches: bool = False
    approved_batch_ids: Optional[list[str]] = None
    include_unverified_medicines: bool = False
    include_expired_batches: bool = False
    override_quarantine_batch_ids: Optional[list[str]] = None
    quarantine_override_reason: Optional[str] = None
    link_existing_medicines: bool = True


class ImportCommitResponse(BaseModel):
    session_id: uuid.UUID
    status: str
    medicines_created: int = 0
    medicines_linked_existing: int = 0
    batches_created: int = 0
    batches_quarantined_skipped: int = 0
    suppliers_created: int = 0
    suppliers_matched: int = 0
    purchases_created: int = 0
    purchase_items_created: int = 0
    audit_log_id: Optional[uuid.UUID] = None
    committed_at: datetime
    errors: list[str] = Field(default_factory=list)


class ImportSessionSummaryOut(BaseModel):
    id: uuid.UUID
    filename: str
    file_hash: str
    status: str
    uploaded_by: Optional[uuid.UUID] = None
    total_medicines: int
    committed_medicines: int
    total_batches: int
    committed_batches: int
    created_at: datetime

