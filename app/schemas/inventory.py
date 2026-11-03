import uuid
from datetime import date

from pydantic import BaseModel


class LowStockItem(BaseModel):
    medicine_id: uuid.UUID
    name: str
    current_stock: int
    minimum_stock: int


class ExpiringBatchItem(BaseModel):
    batch_id: uuid.UUID
    medicine_id: uuid.UUID
    medicine_name: str
    batch_number: str | None
    expiry_date: date
    days_left: int
    quantity: int
    severity: str
