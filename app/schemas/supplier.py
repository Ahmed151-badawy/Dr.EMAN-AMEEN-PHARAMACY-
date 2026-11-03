import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = None
    address: str | None = Field(default=None, max_length=255)
    contact_person: str | None = Field(default=None, max_length=150)
    is_active: bool = True


class SupplierUpdate(BaseModel):
    """All fields optional — PATCH semantics, only supplied fields change."""

    name: str | None = Field(default=None, min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = None
    address: str | None = Field(default=None, max_length=255)
    contact_person: str | None = Field(default=None, max_length=150)
    is_active: bool | None = None


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    phone: str | None
    email: str | None
    address: str | None
    contact_person: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
