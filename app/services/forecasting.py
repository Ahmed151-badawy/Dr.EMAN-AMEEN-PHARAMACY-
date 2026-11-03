"""
Phase 7 — Demand Forecasting & Stockout Prediction Service
==========================================================
Statistical demand forecasting using historical sales/returns ledger data.
Operates deterministically without ML libraries.

Public API
----------
calculate_moving_average(series) -> float
calculate_weighted_moving_average(series) -> float
calculate_exponential_smoothing(series, alpha) -> float
calculate_stockout_date(current_stock, daily_demand, as_of) -> tuple[date | None, int | None]
calculate_reorder_recommendation(current_stock, daily_demand, minimum_stock, lead_time_days, horizon_days) -> int

get_daily_demand_series(db, medicine_id, lookback_days, as_of) -> tuple[list[tuple[date, int]], int, str]
compute_medicine_forecast(db, medicine, method, lookback_days, lead_time_days, horizon_days, as_of) -> DemandForecast
generate_demand_forecasts(db, method, medicine_id, lookback_days, lead_time_days, horizon_days) -> list[DemandForecast]
sync_forecast_notifications(db, forecasts) -> dict[str, int]
"""
from __future__ import annotations

import math
import uuid
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.demand_forecast import DemandForecast, ForecastMethod
from app.models.inventory_movement import InventoryMovement, MovementReason
from app.models.medicine import Medicine
from app.models.notification import (
    Notification,
    NotificationSeverity,
    NotificationType,
)
from app.services.inventory import get_total_stock


# ---------------------------------------------------------------------------
# Pure mathematical forecasting calculations (Independently Testable)
# ---------------------------------------------------------------------------

def calculate_moving_average(series: list[float | int]) -> float:
    """Simple Moving Average (SMA) over a demand series.

    Returns 0.0 if the series is empty.
    """
    if not series:
        return 0.0
    return round(float(sum(series)) / len(series), 2)


def calculate_weighted_moving_average(series: list[float | int]) -> float:
    """Linearly Weighted Moving Average (WMA) giving higher weight to recent days.

    w_t = t (for t = 1..N). Returns 0.0 if series is empty.
    """
    if not series:
        return 0.0
    n = len(series)
    weights = list(range(1, n + 1))
    total_weight = sum(weights)
    if total_weight == 0:
        return 0.0
    weighted_sum = sum(w * float(val) for w, val in zip(weights, series))
    return round(weighted_sum / total_weight, 2)


def calculate_exponential_smoothing(
    series: list[float | int], alpha: float = 0.3
) -> float:
    """Single Exponential Smoothing (EMA) with smoothing constant alpha in (0, 1].

    Returns 0.0 if series is empty.
    """
    if not series:
        return 0.0
    s = float(series[0])
    for val in series[1:]:
        s = alpha * float(val) + (1.0 - alpha) * s
    return round(s, 2)


def calculate_croston_forecast(
    series: list[float | int], alpha: float = 0.1
) -> float:
    """Croston's Method for intermittent demand forecasting.

    Separates non-zero demand magnitude (z) and inter-arrival intervals (p).
    Deterministic pure Python without external dependencies.
    Returns 0.0 if the series contains no non-zero demand.
    """
    if not series:
        return 0.0

    # Find index of first non-zero demand period
    first_idx = next((i for i, val in enumerate(series) if val > 0), None)
    if first_idx is None:
        return 0.0

    z = float(series[first_idx])
    p = 1.0
    q = 1

    for val in series[first_idx + 1:]:
        if val > 0:
            z = alpha * float(val) + (1.0 - alpha) * z
            p = alpha * float(q) + (1.0 - alpha) * p
            q = 1
        else:
            q += 1

    if p <= 0:
        return round(z, 2)
    return round(z / p, 2)


def calculate_naive_forecast(series: list[float | int]) -> float:
    """Naive-1 baseline forecast: uses the demand of the most recent observed day."""
    if not series:
        return 0.0
    return round(float(series[-1]), 2)


def calculate_wape(
    actuals: list[float | int], predictions: list[float | int]
) -> float:
    """Weighted Absolute Percentage Error (WAPE / MAD-to-Mean ratio).

    WAPE = sum(|actual_t - pred_t|) / sum(actual_t) * 100%
    Division-by-zero safe for intermittent demand and zero-demand days.
    """
    if not actuals or not predictions or len(actuals) != len(predictions):
        return 0.0
    total_actual = sum(float(a) for a in actuals)
    total_abs_error = sum(abs(float(a) - float(p)) for a, p in zip(actuals, predictions))
    if total_actual == 0.0:
        return 0.0 if total_abs_error == 0.0 else 100.0
    return round((total_abs_error / total_actual) * 100.0, 2)


def calculate_forecast_bias(
    actuals: list[float | int], predictions: list[float | int]
) -> float:
    """Forecast Bias: sum(predicted_t - actual_t).

    Positive: systematic over-forecasting (excess inventory / tie-up risk).
    Negative: systematic under-forecasting (stockout / lost sales risk).
    """
    if not actuals or not predictions or len(actuals) != len(predictions):
        return 0.0
    bias = sum(float(p) - float(a) for a, p in zip(actuals, predictions))
    return round(bias, 2)


def calculate_mae(
    actuals: list[float | int], predictions: list[float | int]
) -> float:
    """Mean Absolute Error (MAE)."""
    if not actuals or not predictions or len(actuals) != len(predictions):
        return 0.0
    mae = sum(abs(float(a) - float(p)) for a, p in zip(actuals, predictions)) / len(actuals)
    return round(mae, 2)


def calculate_stockout_date(
    current_stock: int, daily_demand: float, as_of: date
) -> tuple[date | None, int | None]:
    """Calculate predicted stockout date and days remaining until stockout.

    Returns:
      (stockout_date, days_until_stockout)
    """
    if daily_demand <= 0:
        return None, None
    if current_stock <= 0:
        return as_of, 0

    days = int(current_stock // daily_demand)
    stockout_date = as_of + timedelta(days=days)
    return stockout_date, days


def calculate_reorder_recommendation(
    current_stock: int,
    daily_demand: float,
    minimum_stock: int,
    lead_time_days: int = 7,
    horizon_days: int = 30,
    max_reorder_multiplier: float | None = 3.0,
) -> int:
    """Calculate recommended reorder quantity based on:
    Target Inventory = Expected Demand (Lead Time + Planning Horizon) + Safety Stock.

    Recommended Reorder = max(0, ceil(Target Inventory - Current Stock))
    Includes an optional safeguard ceiling to cap extreme recommendations caused by outlier spikes.
    """
    safety_stock = minimum_stock
    if daily_demand <= 0:
        if current_stock < minimum_stock:
            return minimum_stock - current_stock
        return 0

    expected_demand = daily_demand * (lead_time_days + horizon_days)
    target_inventory = expected_demand + safety_stock
    reorder_qty = math.ceil(target_inventory - current_stock)
    raw_qty = max(0, int(reorder_qty))

    # Safeguard ceiling: prevent extreme one-off surges from generating astronomical reorder recommendations
    if max_reorder_multiplier is not None and max_reorder_multiplier > 0:
        sane_ceiling = math.ceil(expected_demand * max_reorder_multiplier + safety_stock)
        return min(raw_qty, sane_ceiling)

    return raw_qty


# ---------------------------------------------------------------------------
# Database retrieval & Continuous Calendar Series
# ---------------------------------------------------------------------------

def get_daily_demand_series(
    db: Session,
    medicine_id: uuid.UUID,
    lookback_days: int = 30,
    as_of: date | None = None,
) -> tuple[list[tuple[date, int]], int, str]:
    """Aggregate a continuous daily demand series from InventoryMovement.

    Gross sales and returns are handled separately:
      - SALE movements (quantity_change < 0): units sold = -quantity_change
      - SALE_RETURN movements (quantity_change > 0): units returned = +quantity_change
      - Net Daily Demand = max(0, gross_sales - returns)

    Fills in zero for days without activity to form a continuous calendar series.
    Returns:
      (series, observed_days, notes)
    """
    if as_of is None:
        as_of = date.today()

    lookback = max(1, lookback_days)
    start_date = as_of - timedelta(days=lookback - 1)
    end_date = as_of

    # Fetch all SALE and SALE_RETURN movements in the lookback window
    stmt = (
        select(InventoryMovement)
        .where(
            InventoryMovement.medicine_id == medicine_id,
            InventoryMovement.reason.in_([MovementReason.SALE, MovementReason.SALE_RETURN]),
            InventoryMovement.created_at >= datetime.combine(start_date, time.min),
            InventoryMovement.created_at <= datetime.combine(end_date, time.max),
        )
        .order_by(InventoryMovement.created_at.asc())
    )
    movements = db.scalars(stmt).all()

    # Aggregate by date
    daily_sales: dict[date, int] = {}
    daily_returns: dict[date, int] = {}

    for m in movements:
        m_date = m.created_at.date()
        if m.reason == MovementReason.SALE:
            daily_sales[m_date] = daily_sales.get(m_date, 0) + (-m.quantity_change)
        elif m.reason == MovementReason.SALE_RETURN:
            daily_returns[m_date] = daily_returns.get(m_date, 0) + m.quantity_change

    # Generate continuous calendar series
    series: list[tuple[date, int]] = []
    curr = start_date
    while curr <= end_date:
        sold = daily_sales.get(curr, 0)
        ret = daily_returns.get(curr, 0)
        net = max(0, sold - ret)
        series.append((curr, net))
        curr += timedelta(days=1)

    # Determine earliest history / observation span
    earliest_mv_date = db.scalar(
        select(func.min(InventoryMovement.created_at)).where(
            InventoryMovement.medicine_id == medicine_id,
            InventoryMovement.reason.in_([MovementReason.SALE, MovementReason.SALE_RETURN]),
        )
    )

    med = db.get(Medicine, medicine_id)
    created_date = med.created_at.date() if med else start_date

    first_activity_date = earliest_mv_date.date() if earliest_mv_date else created_date
    observed_days = max(1, (as_of - first_activity_date).days + 1)
    observed_days = min(observed_days, len(series))

    total_sales_count = sum(val for _, val in series)

    if not movements or total_sales_count == 0:
        if observed_days < 3:
            notes = f"Insufficient historical data ({observed_days} day(s) observed, 0 sales)"
        else:
            notes = f"No sales recorded in the {len(series)}-day lookback period"
    elif observed_days < 5:
        notes = f"Limited historical data ({observed_days} day(s) observed)"
    else:
        notes = f"Forecast calculated over {len(series)} continuous calendar days"

    return series, observed_days, notes


# ---------------------------------------------------------------------------
# Forecast Generation
# ---------------------------------------------------------------------------

def compute_medicine_forecast(
    db: Session,
    medicine: Medicine,
    method: ForecastMethod = ForecastMethod.MOVING_AVERAGE,
    lookback_days: int | None = None,
    lead_time_days: int | None = None,
    horizon_days: int | None = None,
    as_of: date | None = None,
) -> DemandForecast:
    """Compute demand forecast, stockout prediction, and reorder recommendation
    for a single medicine. Does NOT commit to database.
    """
    if as_of is None:
        as_of = date.today()
    if lookback_days is None:
        lookback_days = settings.FORECAST_LOOKBACK_DAYS
    if lead_time_days is None:
        lead_time_days = settings.FORECAST_LEAD_TIME_DAYS
    if horizon_days is None:
        horizon_days = settings.FORECAST_HORIZON_DAYS

    # 1. Continuous demand series
    series_points, observed_days, data_notes = get_daily_demand_series(
        db, medicine.id, lookback_days=lookback_days, as_of=as_of
    )
    values = [val for _, val in series_points]

    # 2. Daily demand estimation
    if method == ForecastMethod.MOVING_AVERAGE:
        daily_demand = calculate_moving_average(values)
    elif method == ForecastMethod.WEIGHTED_MOVING_AVERAGE:
        daily_demand = calculate_weighted_moving_average(values)
    elif method == ForecastMethod.EXPONENTIAL_SMOOTHING:
        daily_demand = calculate_exponential_smoothing(values)
    else:
        daily_demand = calculate_moving_average(values)

    # 3. Stockout prediction
    current_stock = get_total_stock(db, medicine.id)
    predicted_stockout_date, days_until = calculate_stockout_date(
        current_stock, daily_demand, as_of
    )

    # 4. Reorder recommendation
    reorder_qty = calculate_reorder_recommendation(
        current_stock=current_stock,
        daily_demand=daily_demand,
        minimum_stock=medicine.minimum_stock,
        lead_time_days=lead_time_days,
        horizon_days=horizon_days,
    )

    notes = data_notes
    if predicted_stockout_date and days_until is not None:
        if days_until == 0:
            notes += " | Current stock is ZERO (stocked out)"
        else:
            notes += f" | Estimated stockout in {days_until} day(s)"

    forecast = DemandForecast(
        medicine_id=medicine.id,
        method=method,
        forecast_date=as_of,
        predicted_daily_demand=daily_demand,
        predicted_stockout_date=predicted_stockout_date,
        recommended_reorder_qty=reorder_qty,
        notes=notes[:255],
    )
    return forecast


def generate_demand_forecasts(
    db: Session,
    method: ForecastMethod = ForecastMethod.MOVING_AVERAGE,
    medicine_id: uuid.UUID | None = None,
    lookback_days: int | None = None,
    lead_time_days: int | None = None,
    horizon_days: int | None = None,
) -> list[DemandForecast]:
    """Generate and record forecast snapshots in demand_forecasts table.
    Also synchronizes Phase 6 stockout and reorder notifications.
    """
    stmt = select(Medicine).where(Medicine.is_active.is_(True))
    if medicine_id is not None:
        stmt = stmt.where(Medicine.id == medicine_id)

    medicines = db.scalars(stmt).all()
    forecasts: list[DemandForecast] = []

    for med in medicines:
        fc = compute_medicine_forecast(
            db,
            med,
            method=method,
            lookback_days=lookback_days,
            lead_time_days=lead_time_days,
            horizon_days=horizon_days,
        )
        db.add(fc)
        forecasts.append(fc)

    db.flush()

    # Sync Phase 6 notifications for generated forecasts
    sync_forecast_notifications(db, forecasts)

    db.commit()
    for fc in forecasts:
        db.refresh(fc)
    return forecasts


# ---------------------------------------------------------------------------
# Phase 6 Notification Integration
# ---------------------------------------------------------------------------

def sync_forecast_notifications(
    db: Session, forecasts: list[DemandForecast]
) -> dict[str, int]:
    """Synchronize Phase 6 notifications (STOCKOUT_PREDICTED, REORDER_SUGGESTED)
    based on latest forecast snapshots.
    """
    created = 0
    resolved = 0
    today = date.today()
    alert_days = settings.STOCKOUT_ALERT_DAYS

    active_stockout_med_ids: set[uuid.UUID] = set()
    active_reorder_med_ids: set[uuid.UUID] = set()

    for fc in forecasts:
        med = db.get(Medicine, fc.medicine_id)
        if not med or not med.is_active:
            continue

        current_stock = get_total_stock(db, med.id)
        daily_demand = float(fc.predicted_daily_demand)

        # 1. STOCKOUT_PREDICTED Check
        if fc.predicted_stockout_date is not None:
            days_left = (fc.predicted_stockout_date - today).days
            if days_left <= alert_days:
                active_stockout_med_ids.add(med.id)
                severity = (
                    NotificationSeverity.CRITICAL
                    if days_left <= 2 or current_stock == 0
                    else NotificationSeverity.WARNING
                )
                title = f"Predicted Stockout: {med.name}"
                if current_stock == 0:
                    message = f"{med.name} is currently out of stock."
                else:
                    message = (
                        f"{med.name} is predicted to run out of stock in {days_left} day(s) "
                        f"(on {fc.predicted_stockout_date}). Current stock: {current_stock}, "
                        f"estimated demand: {daily_demand:.1f}/day."
                    )

                existing = _get_active_notification(
                    db, NotificationType.STOCKOUT_PREDICTED, med.id
                )
                if existing is None:
                    _create_notif(
                        db,
                        ntype=NotificationType.STOCKOUT_PREDICTED,
                        severity=severity,
                        title=title,
                        message=message,
                        medicine_id=med.id,
                    )
                    created += 1
                else:
                    existing.severity = severity
                    existing.title = title
                    existing.message = message

        # 2. REORDER_SUGGESTED Check
        reorder_qty = fc.recommended_reorder_qty or 0
        reorder_point = med.minimum_stock + int(daily_demand * settings.FORECAST_LEAD_TIME_DAYS)

        if reorder_qty > 0 and current_stock <= reorder_point:
            active_reorder_med_ids.add(med.id)
            severity = (
                NotificationSeverity.WARNING
                if current_stock <= med.minimum_stock
                else NotificationSeverity.INFO
            )
            title = f"Reorder Recommendation: {med.name}"
            message = (
                f"Recommended to reorder {reorder_qty} unit(s) of {med.name}. "
                f"Current stock: {current_stock}, estimated daily demand: {daily_demand:.1f}/day."
            )

            existing = _get_active_notification(
                db, NotificationType.REORDER_SUGGESTED, med.id
            )
            if existing is None:
                _create_notif(
                    db,
                    ntype=NotificationType.REORDER_SUGGESTED,
                    severity=severity,
                    title=title,
                    message=message,
                    medicine_id=med.id,
                )
                created += 1
            else:
                existing.severity = severity
                existing.title = title
                existing.message = message

    # Resolve active notifications that are no longer triggering
    forecasted_med_ids = {fc.medicine_id for fc in forecasts}

    # Stale STOCKOUT_PREDICTED
    active_stockouts = db.scalars(
        select(Notification).where(
            Notification.type == NotificationType.STOCKOUT_PREDICTED,
            Notification.is_resolved.is_(False),
            Notification.related_medicine_id.in_(forecasted_med_ids),
        )
    ).all()
    for n in active_stockouts:
        if n.related_medicine_id not in active_stockout_med_ids:
            n.is_resolved = True
            resolved += 1

    # Stale REORDER_SUGGESTED
    active_reorders = db.scalars(
        select(Notification).where(
            Notification.type == NotificationType.REORDER_SUGGESTED,
            Notification.is_resolved.is_(False),
            Notification.related_medicine_id.in_(forecasted_med_ids),
        )
    ).all()
    for n in active_reorders:
        if n.related_medicine_id not in active_reorder_med_ids:
            n.is_resolved = True
            resolved += 1

    return {"created": created, "resolved": resolved}


def _get_active_notification(
    db: Session, ntype: NotificationType, medicine_id: uuid.UUID
) -> Notification | None:
    return db.scalar(
        select(Notification).where(
            Notification.type == ntype,
            Notification.related_medicine_id == medicine_id,
            Notification.related_batch_id.is_(None),
            Notification.is_resolved.is_(False),
        )
    )


def _create_notif(
    db: Session,
    *,
    ntype: NotificationType,
    severity: NotificationSeverity,
    title: str,
    message: str,
    medicine_id: uuid.UUID,
) -> Notification:
    n = Notification(
        type=ntype,
        severity=severity,
        title=title,
        message=message,
        related_medicine_id=medicine_id,
        related_batch_id=None,
        is_read=False,
        is_resolved=False,
    )
    db.add(n)
    return n


# ---------------------------------------------------------------------------
# Phase 8 — Backtesting & Empirical Forecast Evaluation
# ---------------------------------------------------------------------------

def evaluate_forecast_models(
    db: Session,
    test_days: int = 3,
    lookback_days: int = 5,
    medicine_id: uuid.UUID | None = None,
    as_of: date | None = None,
) -> dict:
    """Historical time-split backtest comparing SMA, WMA, SES, Croston, and Naive baselines.

    Strictly prevents data leakage by ending the training lookback window
    the day immediately preceding test_start.

    Evaluates:
      - WAPE (Weighted Absolute Percentage Error)
      - Forecast Bias (sum of predicted - actual)
      - MAE (Mean Absolute Error)
      - Average predicted daily volume
    """
    if as_of is None:
        as_of = date.today()

    test_days = max(1, min(test_days, 60))
    lookback_days = max(1, min(lookback_days, 180))

    test_end = as_of
    test_start = test_end - timedelta(days=test_days - 1)
    train_end = test_start - timedelta(days=1)
    train_start = train_end - timedelta(days=lookback_days - 1)

    stmt = select(Medicine).where(Medicine.is_active.is_(True))
    if medicine_id is not None:
        stmt = stmt.where(Medicine.id == medicine_id)

    medicines = db.scalars(stmt).all()

    actuals_all: list[float] = []
    preds_sma: list[float] = []
    preds_wma: list[float] = []
    preds_ses: list[float] = []
    preds_croston: list[float] = []
    preds_naive: list[float] = []

    total_meds_evaluated = 0

    for med in medicines:
        # 1. Training series (strictly historical, prior to test_start)
        train_series, _, _ = get_daily_demand_series(
            db, med.id, lookback_days=lookback_days, as_of=train_end
        )
        train_values = [float(v) for _, v in train_series]

        # 2. Test series (ground truth during evaluation period)
        test_series, _, _ = get_daily_demand_series(
            db, med.id, lookback_days=test_days, as_of=test_end
        )
        test_values = [float(v) for _, v in test_series]

        # Model predictions based strictly on training history
        m_sma = calculate_moving_average(train_values)
        m_wma = calculate_weighted_moving_average(train_values)
        m_ses = calculate_exponential_smoothing(train_values, alpha=0.3)
        m_croston = calculate_croston_forecast(train_values, alpha=0.1)
        m_naive = calculate_naive_forecast(train_values)

        n_test = len(test_values)
        actuals_all.extend(test_values)
        preds_sma.extend([m_sma] * n_test)
        preds_wma.extend([m_wma] * n_test)
        preds_ses.extend([m_ses] * n_test)
        preds_croston.extend([m_croston] * n_test)
        preds_naive.extend([m_naive] * n_test)

        total_meds_evaluated += 1

    total_test_units = int(sum(actuals_all))

    models_res = [
        {
            "method": "Simple Moving Average (SMA)",
            "wape": calculate_wape(actuals_all, preds_sma),
            "bias": calculate_forecast_bias(actuals_all, preds_sma),
            "mae": calculate_mae(actuals_all, preds_sma),
            "avg_predicted_daily_demand": round(sum(preds_sma) / max(1, len(preds_sma)), 2),
        },
        {
            "method": "Weighted Moving Average (WMA)",
            "wape": calculate_wape(actuals_all, preds_wma),
            "bias": calculate_forecast_bias(actuals_all, preds_wma),
            "mae": calculate_mae(actuals_all, preds_wma),
            "avg_predicted_daily_demand": round(sum(preds_wma) / max(1, len(preds_wma)), 2),
        },
        {
            "method": "Single Exponential Smoothing (SES)",
            "wape": calculate_wape(actuals_all, preds_ses),
            "bias": calculate_forecast_bias(actuals_all, preds_ses),
            "mae": calculate_mae(actuals_all, preds_ses),
            "avg_predicted_daily_demand": round(sum(preds_ses) / max(1, len(preds_ses)), 2),
        },
        {
            "method": "Croston Method (Intermittent)",
            "wape": calculate_wape(actuals_all, preds_croston),
            "bias": calculate_forecast_bias(actuals_all, preds_croston),
            "mae": calculate_mae(actuals_all, preds_croston),
            "avg_predicted_daily_demand": round(sum(preds_croston) / max(1, len(preds_croston)), 2),
        },
        {
            "method": "Naive-1 Baseline",
            "wape": calculate_wape(actuals_all, preds_naive),
            "bias": calculate_forecast_bias(actuals_all, preds_naive),
            "mae": calculate_mae(actuals_all, preds_naive),
            "avg_predicted_daily_demand": round(sum(preds_naive) / max(1, len(preds_naive)), 2),
        },
    ]

    best = min(models_res, key=lambda m: m["wape"])

    # Check earliest transaction in database for data sufficiency assessment
    earliest_mv_dt = db.scalar(select(func.min(InventoryMovement.created_at)))
    if earliest_mv_dt:
        cal_days = (as_of - earliest_mv_dt.date()).days + 1
    else:
        cal_days = 0

    needed_days = lookback_days + test_days
    if cal_days < needed_days:
        sufficiency_status = (
            f"Limited historical depth: {cal_days} calendar days available in ledger. "
            f"Requested {needed_days} days for non-overlapping backtest."
        )
    else:
        sufficiency_status = f"Sufficient historical depth: {cal_days} calendar days available in ledger."

    return {
        "evaluation_date": as_of,
        "train_window_start": train_start,
        "train_window_end": train_end,
        "test_window_start": test_start,
        "test_window_end": test_end,
        "total_medicines_evaluated": total_meds_evaluated,
        "total_test_demand_units": total_test_units,
        "data_sufficiency_status": sufficiency_status,
        "best_method": best["method"],
        "models": models_res,
        "notes": (
            f"Backtest executed across {total_meds_evaluated} medicines. "
            f"Total ground-truth sales: {total_test_units} units over {test_days} day(s). "
            f"Training cutoff strictly enforced at {train_end}."
        ),
    }
