import uuid
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict


class ControlledTransactionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    transaction_id: str
    item_id: str
    timestamp: datetime
    type: str  # sale, return, adjustment
    type_display_en: str
    type_display_ar: str
    medicine_id: str
    medicine_name: str
    medicine_name_ar: str | None = None
    classification: str
    schedule: str | None = None
    schedule_display_en: str
    schedule_display_ar: str
    batch_number: str | None = None
    quantity: int
    package_unit: str
    conversion_factor: float
    base_quantity: int
    unit_price: float
    total_price: float
    customer_id: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    purchaser_name: str | None = None
    purchaser_id_number: str | None = None
    purchaser_phone: str | None = None
    prescription_reference: str | None = None
    doctor_name: str | None = None
    doctor_license: str | None = None
    prescription_date: date | None = None
    user_id: str | None = None
    user_full_name: str | None = None
    user_role: str | None = None
    original_reference: str | None = None
    notes: str | None = None


class ControlledReportSummaryOut(BaseModel):
    total_records: int
    total_sales_base_quantity: int
    total_returns_base_quantity: int
    total_adjustments_base_quantity: int
    net_dispensed_base_quantity: int


class ControlledReportResponse(BaseModel):
    records: list[ControlledTransactionItemOut]
    total_count: int
    page: int
    limit: int
    summary: ControlledReportSummaryOut
