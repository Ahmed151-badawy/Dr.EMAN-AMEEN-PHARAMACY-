import uuid
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models.medicine import Medicine
from app.models.sale import Sale, SaleItem, SaleStatus
from app.schemas.customer import CustomerStats, TopMedicineItem

# A fully voided sale never happened commercially; exclude it from stats.
# Completed and (partially) returned sales still count as visits/spend,
# since the customer did come in and was invoiced.
_COUNTED_STATUSES = (SaleStatus.COMPLETED, SaleStatus.PARTIALLY_RETURNED, SaleStatus.RETURNED)


def get_customer_stats(db: Session, customer_id: uuid.UUID, top_n: int = 5) -> CustomerStats:
    base = select(Sale).where(
        Sale.customer_id == customer_id, Sale.status.in_(_COUNTED_STATUSES)
    )

    totals = db.execute(
        select(
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total_amount), 0),
            func.min(Sale.created_at),
            func.max(Sale.created_at),
        ).where(Sale.customer_id == customer_id, Sale.status.in_(_COUNTED_STATUSES))
    ).one()
    total_visits, total_spent, first_purchase, last_purchase = totals
    total_spent = Decimal(total_spent)

    average_basket = (
        (total_spent / total_visits) if total_visits else Decimal("0")
    ).quantize(Decimal("0.01"))

    top_rows = db.execute(
        select(
            SaleItem.medicine_id,
            Medicine.name,
            func.sum(SaleItem.quantity).label("total_quantity"),
            func.sum(SaleItem.total_price).label("total_spent"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .join(Medicine, Medicine.id == SaleItem.medicine_id)
        .where(Sale.customer_id == customer_id, Sale.status.in_(_COUNTED_STATUSES))
        .group_by(SaleItem.medicine_id, Medicine.name)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(top_n)
    ).all()

    return CustomerStats(
        customer_id=customer_id,
        total_visits=total_visits,
        total_spent=total_spent,
        average_basket_value=average_basket,
        first_purchase_date=first_purchase,
        last_purchase_date=last_purchase,
        top_medicines=[
            TopMedicineItem(
                medicine_id=r.medicine_id,
                medicine_name=r.name,
                total_quantity=r.total_quantity,
                total_spent=r.total_spent,
            )
            for r in top_rows
        ],
    )
