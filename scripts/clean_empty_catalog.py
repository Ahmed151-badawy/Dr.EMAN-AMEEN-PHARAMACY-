"""
Clean Database to Empty Catalog
Dr. Eman Ameen Pharmacy Management System
==========================================
Purges all medicines, batches, units, suppliers, customers, sales, purchases,
and transactions while preserving ONLY the Primary Owner (Dr. Eman Ameen).
"""

import sys
sys.path.insert(0, "/code")
from sqlalchemy import select, delete, func
from app.core.database import SessionLocal
from app.models.user import User, UserRole
from app.models.supplier import Supplier
from app.models.customer import Customer
from app.models.medicine import (
    Medicine,
    MedicineBatch,
    MedicinePackageUnit,
    MedicineActiveIngredient,
)
from app.models.sale import Sale, SaleItem, SaleReturn
from app.models.purchase import Purchase, PurchaseItem
from app.models.inventory_movement import InventoryMovement
from app.models.notification import Notification
from app.models.demand_forecast import DemandForecast
from app.models.credit import CustomerCreditTransaction, CustomerPayment
from app.models.financial import Expense, SupplierPayment


def clean_to_empty_catalog():
    db = SessionLocal()
    try:
        print("================================================================")
        print("PURGING ALL DATA -> PRESERVING ONLY PRIMARY OWNER (DR. EMAN AMEEN)")
        print("================================================================")

        # 1. Identify & Verify Primary Administrator (Dr. Eman Ameen)
        primary_admin = db.scalar(
            select(User).where(User.username == "admin")
        )
        if not primary_admin:
            print("[FATAL ERROR] Dr. Eman Ameen admin account not found!")
            sys.exit(1)

        primary_admin_id = primary_admin.id
        primary_admin.is_primary_admin = True
        primary_admin.role = UserRole.ADMIN
        primary_admin.is_active = True
        print(f"[PRESERVED] Primary Owner: {primary_admin.full_name} ({primary_admin.username}) - ID: {primary_admin_id}")

        # 2. Foreign-Key safe deletion order
        print("\n--- Purging Transactional Records ---")
        db.query(SaleReturn).delete(synchronize_session=False)
        db.query(SaleItem).delete(synchronize_session=False)
        db.query(CustomerCreditTransaction).delete(synchronize_session=False)
        db.query(CustomerPayment).delete(synchronize_session=False)
        db.query(Sale).delete(synchronize_session=False)

        db.query(PurchaseItem).delete(synchronize_session=False)
        db.query(Purchase).delete(synchronize_session=False)

        db.query(SupplierPayment).delete(synchronize_session=False)
        db.query(Expense).delete(synchronize_session=False)
        db.query(InventoryMovement).delete(synchronize_session=False)
        db.query(Notification).delete(synchronize_session=False)
        db.query(DemandForecast).delete(synchronize_session=False)

        print("\n--- Purging Medicines & Catalog ---")
        db.query(MedicineBatch).delete(synchronize_session=False)
        db.query(MedicineActiveIngredient).delete(synchronize_session=False)
        db.query(MedicinePackageUnit).delete(synchronize_session=False)
        db.query(Medicine).delete(synchronize_session=False)

        print("\n--- Purging Customers & Suppliers ---")
        db.query(Customer).delete(synchronize_session=False)
        db.query(Supplier).delete(synchronize_session=False)

        print("\n--- Purging Secondary Users ---")
        db.query(User).filter(User.id != primary_admin_id).delete(synchronize_session=False)

        db.commit()
        print("\n[COMMIT] Successfully purged all data!")

        # 3. Verification Report
        m_count = db.scalar(select(func.count(Medicine.id)))
        s_count = db.scalar(select(func.count(Supplier.id)))
        c_count = db.scalar(select(func.count(Customer.id)))
        u_count = db.scalar(select(func.count(User.id)))
        b_count = db.scalar(select(func.count(MedicineBatch.id)))
        sale_count = db.scalar(select(func.count(Sale.id)))
        purch_count = db.scalar(select(func.count(Purchase.id)))

        print("\n================================================================")
        print("DATABASE STATUS AFTER CLEANUP:")
        print("================================================================")
        print(f"Users (Primary Admin Only): {u_count} (Preserved: {primary_admin.username})")
        print(f"Medicines:                  {m_count}")
        print(f"Suppliers:                  {s_count}")
        print(f"Customers:                  {c_count}")
        print(f"Batches:                    {b_count}")
        print(f"Sales:                      {sale_count}")
        print(f"Purchases:                  {purch_count}")
        print("================================================================")

        assert m_count == 0, f"Expected 0 medicines, got {m_count}"
        assert s_count == 0, f"Expected 0 suppliers, got {s_count}"
        assert c_count == 0, f"Expected 0 customers, got {c_count}"
        assert u_count == 1, f"Expected 1 user, got {u_count}"
        print("[SUCCESS] Database is 100% clean with empty catalog.")

    finally:
        db.close()


if __name__ == "__main__":
    clean_to_empty_catalog()
