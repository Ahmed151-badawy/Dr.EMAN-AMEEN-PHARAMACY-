import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.demand_forecast import ForecastMethod


class DailyDemandPoint(BaseModel):
    date: date
    quantity_sold: int


class DemandForecastOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID | None = None
    medicine_id: uuid.UUID
    medicine_name: str | None = None
    method: ForecastMethod
    forecast_date: date
    predicted_daily_demand: Decimal
    predicted_stockout_date: date | None = None
    days_until_stockout: int | None = None
    current_stock: int | None = None
    recommended_reorder_qty: int | None = None
    notes: str | None = None
    created_at: datetime | None = None


class MedicineForecastDetail(BaseModel):
    forecast: DemandForecastOut
    history: list[DailyDemandPoint]


class GenerateForecastRequest(BaseModel):
    method: ForecastMethod = ForecastMethod.MOVING_AVERAGE
    medicine_id: uuid.UUID | None = None
    lookback_days: int | None = Field(default=None, ge=1, le=365)
    lead_time_days: int | None = Field(default=None, ge=1, le=90)
    horizon_days: int | None = Field(default=None, ge=1, le=180)


class GenerateForecastResult(BaseModel):
    forecasts_generated: int
    notifications_created: int
    notifications_resolved: int


class ModelEvaluationMetric(BaseModel):
    method: str
    wape: float
    bias: float
    mae: float
    avg_predicted_daily_demand: float


class ForecastEvaluationOut(BaseModel):
    evaluation_date: date
    train_window_start: date
    train_window_end: date
    test_window_start: date
    test_window_end: date
    total_medicines_evaluated: int
    total_test_demand_units: int
    data_sufficiency_status: str
    best_method: str
    models: list[ModelEvaluationMetric]
    notes: str
