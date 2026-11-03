"""
Phase 7 - Demand Forecasting & Stockout Prediction API
======================================================
GET  /forecasts                 - List latest forecasts per medicine (with filters)
GET  /forecasts/{medicine_id}   - Detail view with continuous demand series history
POST /forecasts/generate        - Trigger forecast calculation & sync notifications
"""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.config import settings
from app.core.database import get_db
from app.models.demand_forecast import DemandForecast
from app.models.medicine import Medicine
from app.models.user import User, UserRole
from app.schemas.forecasting import (
    DailyDemandPoint,
    DemandForecastOut,
    ForecastEvaluationOut,
    GenerateForecastRequest,
    GenerateForecastResult,
    MedicineForecastDetail,
)
from app.services.forecasting import (
    compute_medicine_forecast,
    evaluate_forecast_models,
    generate_demand_forecasts,
    get_daily_demand_series,
    sync_forecast_notifications,
)
from app.services.inventory import get_total_stock

router = APIRouter(prefix="/forecasts", tags=["forecasts"])

CAN_GENERATE_FORECASTS = (UserRole.ADMIN, UserRole.INVENTORY_MANAGER)


@router.get("", response_model=list[DemandForecastOut])
def list_forecasts(
    medicine_id: uuid.UUID | None = Query(None, description="Filter by medicine"),
    needs_reorder: bool | None = Query(None, description="True = items where reorder_qty > 0"),
    stockout_within_days: int | None = Query(
        None, ge=0, description="Filter medicines predicted to stock out within N days"
    ),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """List latest demand forecasts.

    Can be filtered by medicine, reorder recommendation, or imminent stockout horizon.
    """
    today = date.today()

    # Get active medicines
    med_stmt = select(Medicine).where(Medicine.is_active.is_(True))
    if medicine_id is not None:
        med_stmt = med_stmt.where(Medicine.id == medicine_id)

    medicines = db.scalars(med_stmt).all()
    if not medicines:
        return []

    results: list[DemandForecastOut] = []

    for med in medicines:
        # Get latest forecast snapshot for this medicine
        fc = db.scalar(
            select(DemandForecast)
            .where(DemandForecast.medicine_id == med.id)
            .order_by(desc(DemandForecast.created_at))
            .limit(1)
        )

        # If no snapshot exists yet, compute on the fly
        if fc is None:
            fc = compute_medicine_forecast(db, med)

        current_stock = get_total_stock(db, med.id)
        days_until = None
        if fc.predicted_stockout_date is not None:
            days_until = max(0, (fc.predicted_stockout_date - today).days)

        # Apply filters
        if needs_reorder is True and (not fc.recommended_reorder_qty or fc.recommended_reorder_qty <= 0):
            continue
        if needs_reorder is False and (fc.recommended_reorder_qty and fc.recommended_reorder_qty > 0):
            continue

        if stockout_within_days is not None:
            if days_until is None or days_until > stockout_within_days:
                continue

        results.append(
            DemandForecastOut(
                id=fc.id,
                medicine_id=med.id,
                medicine_name=med.name,
                method=fc.method,
                forecast_date=fc.forecast_date,
                predicted_daily_demand=fc.predicted_daily_demand,
                predicted_stockout_date=fc.predicted_stockout_date,
                days_until_stockout=days_until,
                current_stock=current_stock,
                recommended_reorder_qty=fc.recommended_reorder_qty,
                notes=fc.notes,
                created_at=fc.created_at,
            )
        )

        if len(results) >= limit:
            break

    return results


@router.get("/evaluation", response_model=ForecastEvaluationOut)
def get_forecast_evaluation(
    test_days: int = Query(3, ge=1, le=30, description="Test period in days"),
    lookback_days: int = Query(5, ge=1, le=90, description="Training lookback window in days"),
    medicine_id: uuid.UUID | None = Query(None, description="Optional filter for single medicine"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Run an empirical, zero-leakage historical backtest comparing SMA, WMA, SES,
    Croston, and Naive baselines against recorded ground truth sales.
    """
    eval_result = evaluate_forecast_models(
        db,
        test_days=test_days,
        lookback_days=lookback_days,
        medicine_id=medicine_id,
    )
    return eval_result


@router.get("/{medicine_id}", response_model=MedicineForecastDetail)
def get_medicine_forecast(
    medicine_id: uuid.UUID,
    lookback_days: int = Query(30, ge=1, le=365, description="Historical demand window"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Retrieve detailed forecast breakdown and historical continuous calendar demand series
    for a single medicine.
    """
    med = db.get(Medicine, medicine_id)
    if med is None or not med.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found")

    today = date.today()
    current_stock = get_total_stock(db, med.id)

    # Get latest snapshot or compute
    fc = db.scalar(
        select(DemandForecast)
        .where(DemandForecast.medicine_id == med.id)
        .order_by(desc(DemandForecast.created_at))
        .limit(1)
    )
    if fc is None:
        fc = compute_medicine_forecast(db, med, lookback_days=lookback_days)

    days_until = None
    if fc.predicted_stockout_date is not None:
        days_until = max(0, (fc.predicted_stockout_date - today).days)

    # Continuous daily history
    series, _, _ = get_daily_demand_series(db, med.id, lookback_days=lookback_days, as_of=today)
    history_points = [
        DailyDemandPoint(date=pt_date, quantity_sold=qty) for pt_date, qty in series
    ]

    forecast_out = DemandForecastOut(
        id=fc.id,
        medicine_id=med.id,
        medicine_name=med.name,
        method=fc.method,
        forecast_date=fc.forecast_date,
        predicted_daily_demand=fc.predicted_daily_demand,
        predicted_stockout_date=fc.predicted_stockout_date,
        days_until_stockout=days_until,
        current_stock=current_stock,
        recommended_reorder_qty=fc.recommended_reorder_qty,
        notes=fc.notes,
        created_at=fc.created_at or today,
    )

    return MedicineForecastDetail(forecast=forecast_out, history=history_points)


@router.post(
    "/generate",
    response_model=GenerateForecastResult,
    dependencies=[Depends(require_roles(*CAN_GENERATE_FORECASTS))],
    status_code=status.HTTP_200_OK,
)
def generate_forecasts(
    payload: GenerateForecastRequest = GenerateForecastRequest(),
    db: Session = Depends(get_db),
):
    """Generate and persist demand forecasts for all active medicines (or single medicine).
    Automatically creates and synchronizes Phase 6 stockout and reorder notifications.
    """
    forecasts = generate_demand_forecasts(
        db,
        method=payload.method,
        medicine_id=payload.medicine_id,
        lookback_days=payload.lookback_days,
        lead_time_days=payload.lead_time_days,
        horizon_days=payload.horizon_days,
    )

    sync_result = sync_forecast_notifications(db, forecasts)
    db.commit()

    return GenerateForecastResult(
        forecasts_generated=len(forecasts),
        notifications_created=sync_result["created"],
        notifications_resolved=sync_result["resolved"],
    )
