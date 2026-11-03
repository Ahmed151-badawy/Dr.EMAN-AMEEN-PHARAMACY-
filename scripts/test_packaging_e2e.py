import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, "/code")

import uuid
import httpx
from decimal import Decimal

API_BASE = "http://127.0.0.1:8000"

def run_tests():
    print("=== Starting Packaging & Multi-Unit Pricing E2E Test ===")
    
    with httpx.Client(base_url=API_BASE, timeout=30.0) as client:
        from app.core.database import SessionLocal
        from app.models.user import User, UserRole
        from app.core.security import create_access_token

        db = SessionLocal()
        admin_user = db.query(User).filter(User.role == UserRole.ADMIN).first()
        db.close()
        assert admin_user is not None, "Admin user must exist"

        token = create_access_token(subject=str(admin_user.id), role=admin_user.role.value)
        headers = {"Authorization": f"Bearer {token}"}
        print(f"✓ Generated test auth token for admin '{admin_user.username}'")

        # Fetch lookup data (dosage forms, drug families)
        df_resp = client.get("/medicines/dosage-forms", headers=headers)
        assert df_resp.status_code == 200
        dosage_forms = df_resp.json()
        tablet_form = next((f for f in dosage_forms if "tablet" in f["name_en"].lower()), dosage_forms[0])
        ampoule_form = next((f for f in dosage_forms if "ampoule" in f["name_en"].lower() or "injection" in f["name_en"].lower()), dosage_forms[0])
        
        fam_resp = client.get("/medicines/drug-families", headers=headers)
        assert fam_resp.status_code == 200
        families = fam_resp.json()
        default_family = families[0] if families else None
        family_id = default_family["id"] if default_family else None

        test_med_ids = []
        test_sale_ids = []

        try:
            # -------------------------------------------------------------------
            # Test 1: Create 3-Level Medicine (Box → Strip → Unit)
            # -------------------------------------------------------------------
            print("\n--- Test 1: Creating 3-Level Medicine (Box → Strip → Unit) ---")
            box_barcode = f"BOX-{uuid.uuid4().hex[:8]}"
            strip_barcode = f"STP-{uuid.uuid4().hex[:8]}"
            unit_barcode = f"UNT-{uuid.uuid4().hex[:8]}"

            payload_3level = {
                "name": "Panadol Extra Test",
                "name_ar": "بنادول اكسترا تجريبي",
                "generic_name": "Paracetamol + Caffeine",
                "dosage_form_id": tablet_form["id"],
                "drug_family_id": family_id,
                "selling_price": 120.0,
                "purchase_price": 96.0,
                "base_unit_name": "Unit",
                "minimum_stock": 10,
                "package_units": [
                    {
                        "unit_name_en": "Box",
                        "unit_name_ar": "علبة",
                        "conversion_factor": 30.0,
                        "selling_price": 120.0,
                        "purchase_price": 96.0,
                        "barcode": box_barcode,
                        "is_base_unit": False,
                        "is_default_dispense": False,
                        "allow_selling": True,
                        "is_active": True,
                    },
                    {
                        "unit_name_en": "Strip",
                        "unit_name_ar": "شريط",
                        "conversion_factor": 10.0,
                        "selling_price": 40.0,
                        "purchase_price": 32.0,
                        "barcode": strip_barcode,
                        "is_base_unit": False,
                        "is_default_dispense": True,
                        "allow_selling": True,
                        "is_active": True,
                    },
                    {
                        "unit_name_en": "Unit",
                        "unit_name_ar": "وحدة [قرص]",
                        "conversion_factor": 1.0,
                        "selling_price": 4.0,
                        "purchase_price": 3.2,
                        "barcode": unit_barcode,
                        "is_base_unit": True,
                        "is_default_dispense": False,
                        "allow_selling": True,
                        "is_active": True,
                    },
                ],
            }

            m_create_resp = client.post("/medicines", json=payload_3level, headers=headers)
            assert m_create_resp.status_code == 201, f"Create 3-level medicine failed: {m_create_resp.text}"
            med_3level = m_create_resp.json()
            med_3level_id = med_3level["id"]
            test_med_ids.append(med_3level_id)

            assert len(med_3level["package_units"]) == 3, "Expected 3 package units"
            box_u = next(u for u in med_3level["package_units"] if u["unit_name_en"] == "Box")
            strip_u = next(u for u in med_3level["package_units"] if u["unit_name_en"] == "Strip")
            unit_u = next(u for u in med_3level["package_units"] if u["unit_name_en"] == "Unit")

            assert float(box_u["conversion_factor"]) == 30.0, f"Expected Box factor 30, got {box_u['conversion_factor']}"
            assert float(strip_u["conversion_factor"]) == 10.0, f"Expected Strip factor 10, got {strip_u['conversion_factor']}"
            assert float(unit_u["conversion_factor"]) == 1.0, f"Expected Unit factor 1, got {unit_u['conversion_factor']}"
            assert unit_u["is_base_unit"] is True, "Unit must be base inventory unit"
            assert strip_u["is_default_dispense"] is True, "Strip must be default dispense unit"
            print("✓ 3-Level medicine created with exact conversion factors: Box(30), Strip(10), Unit(1)")

            # -------------------------------------------------------------------
            # Test 2: Price Suggestions and Manual Override Preservation
            # -------------------------------------------------------------------
            print("\n--- Test 2: Testing Manual Price Override Preservation ---")
            # Pharmacist customizes Strip price to 42.00 EGP (override from suggested 40.00)
            update_payload = {
                "package_units": [
                    {
                        "unit_name_en": "Box",
                        "unit_name_ar": "علبة",
                        "conversion_factor": 30.0,
                        "selling_price": 120.0,
                        "purchase_price": 96.0,
                        "barcode": box_barcode,
                        "is_base_unit": False,
                        "is_default_dispense": False,
                        "allow_selling": True,
                        "is_active": True,
                    },
                    {
                        "unit_name_en": "Strip",
                        "unit_name_ar": "شريط",
                        "conversion_factor": 10.0,
                        "selling_price": 42.0,  # Manual override!
                        "purchase_price": 32.0,
                        "barcode": strip_barcode,
                        "is_base_unit": False,
                        "is_default_dispense": True,
                        "allow_selling": True,
                        "is_active": True,
                    },
                    {
                        "unit_name_en": "Unit",
                        "unit_name_ar": "وحدة [قرص]",
                        "conversion_factor": 1.0,
                        "selling_price": 4.0,
                        "purchase_price": 3.2,
                        "barcode": unit_barcode,
                        "is_base_unit": True,
                        "is_default_dispense": False,
                        "allow_selling": True,
                        "is_active": True,
                    },
                ]
            }
            patch_resp = client.patch(f"/medicines/{med_3level_id}", json=update_payload, headers=headers)
            assert patch_resp.status_code == 200, f"Patch failed: {patch_resp.text}"
            med_patched = patch_resp.json()
            strip_patched = next(u for u in med_patched["package_units"] if u["unit_name_en"] == "Strip")
            assert float(strip_patched["selling_price"]) == 42.0, f"Expected Strip price 42.0, got {strip_patched['selling_price']}"
            print("✓ Manual price override preserved at 42.00 EGP")

            # -------------------------------------------------------------------
            # Test 3: Create 2-Level Medicine (Box → Unit, e.g. Ampoules)
            # -------------------------------------------------------------------
            print("\n--- Test 3: Creating 2-Level Medicine (Box → Unit, e.g. Ampoules) ---")
            amp_box_bc = f"AMPBOX-{uuid.uuid4().hex[:8]}"
            amp_unt_bc = f"AMPUNT-{uuid.uuid4().hex[:8]}"
            payload_2level = {
                "name": "Voltaren 75mg Ampoules",
                "name_ar": "فولتارين 75 مجم أمبولات",
                "generic_name": "Diclofenac Sodium",
                "dosage_form_id": ampoule_form["id"],
                "drug_family_id": family_id,
                "selling_price": 100.0,
                "purchase_price": 80.0,
                "base_unit_name": "Unit",
                "minimum_stock": 5,
                "package_units": [
                    {
                        "unit_name_en": "Box",
                        "unit_name_ar": "علبة",
                        "conversion_factor": 5.0,
                        "selling_price": 100.0,
                        "purchase_price": 80.0,
                        "barcode": amp_box_bc,
                        "is_base_unit": False,
                        "is_default_dispense": True,
                        "allow_selling": True,
                        "is_active": True,
                    },
                    {
                        "unit_name_en": "Unit",
                        "unit_name_ar": "وحدة [أمبول]",
                        "conversion_factor": 1.0,
                        "selling_price": 20.0,
                        "purchase_price": 16.0,
                        "barcode": amp_unt_bc,
                        "is_base_unit": True,
                        "is_default_dispense": False,
                        "allow_selling": True,
                        "is_active": True,
                    },
                ],
            }
            amp_create_resp = client.post("/medicines", json=payload_2level, headers=headers)
            assert amp_create_resp.status_code == 201, f"Create 2-level medicine failed: {amp_create_resp.text}"
            med_2level = amp_create_resp.json()
            med_2level_id = med_2level["id"]
            test_med_ids.append(med_2level_id)
            assert len(med_2level["package_units"]) == 2
            print("✓ 2-Level medicine created successfully (Box=5, Unit=1)")

            # -------------------------------------------------------------------
            # Test 4: Barcode Lookup at Different Packaging Levels
            # -------------------------------------------------------------------
            print("\n--- Test 4: Barcode Lookup at Different Packaging Levels ---")
            # Scan Box barcode
            scan_box = client.get(f"/medicines/barcode/{box_barcode}", headers=headers)
            assert scan_box.status_code == 200, f"Box barcode scan failed: {scan_box.text}"
            res_box = scan_box.json()
            assert res_box["matched_unit"]["unit_name_en"] == "Box"
            assert float(res_box["matched_unit"]["conversion_factor"]) == 30.0
            print("✓ Scanning Box barcode resolved matched_unit: Box (conversion factor 30)")

            # Scan Strip barcode
            scan_strip = client.get(f"/medicines/barcode/{strip_barcode}", headers=headers)
            assert scan_strip.status_code == 200, f"Strip barcode scan failed: {scan_strip.text}"
            res_strip = scan_strip.json()
            assert res_strip["matched_unit"]["unit_name_en"] == "Strip"
            assert float(res_strip["matched_unit"]["conversion_factor"]) == 10.0
            print("✓ Scanning Strip barcode resolved matched_unit: Strip (conversion factor 10)")

            # Scan Unit barcode
            scan_unit = client.get(f"/medicines/barcode/{unit_barcode}", headers=headers)
            assert scan_unit.status_code == 200, f"Unit barcode scan failed: {scan_unit.text}"
            res_unit = scan_unit.json()
            assert res_unit["matched_unit"]["unit_name_en"] == "Unit"
            assert float(res_unit["matched_unit"]["conversion_factor"]) == 1.0
            print("✓ Scanning Unit barcode resolved matched_unit: Unit (conversion factor 1)")

            # -------------------------------------------------------------------
            # Test 5: Purchase Receiving (Inventory in Base Units)
            # -------------------------------------------------------------------
            print("\n--- Test 5: Purchase Receiving (Adding Stock in Base Units) ---")
            # Receive 2 boxes = 60 base units
            batch_payload = {
                "batch_number": "BN-202610-01",
                "quantity": 60,
                "expiry_date": "2027-12-31",
                "purchase_price": 96.0,
                "selling_price": 120.0,
            }
            batch_resp = client.post(f"/medicines/{med_3level_id}/batches", json=batch_payload, headers=headers)
            assert batch_resp.status_code == 201, f"Batch creation failed: {batch_resp.text}"
            print("✓ Received 2 boxes (60 base units) into batch BN-202610-01")

            # Verify stock endpoint
            med_stock_resp = client.get(f"/medicines/{med_3level_id}", headers=headers)
            assert med_stock_resp.status_code == 200
            assert med_stock_resp.json()["total_stock"] == 60
            print("✓ Total stock confirmed: 60 base units")

            # -------------------------------------------------------------------
            # Test 6: POS Sales Across Multi-Unit Tiers
            # -------------------------------------------------------------------
            print("\n--- Test 6: POS Sales Across Box, Strip, Unit Tiers ---")
            box_unit_id = box_u["id"]
            strip_unit_id = strip_u["id"]
            unit_unit_id = unit_u["id"]

            # Sale 1: Sell 1 Box
            sale1_payload = {
                "payment_method": "cash",
                "discount": 0.0,
                "items": [
                    {
                        "medicine_id": med_3level_id,
                        "package_unit_id": box_unit_id,
                        "quantity": 1,
                    }
                ],
            }
            s1_resp = client.post("/sales", json=sale1_payload, headers=headers)
            assert s1_resp.status_code == 201, f"Sale 1 failed: {s1_resp.text}"
            sale1 = s1_resp.json()
            test_sale_ids.append(sale1["id"])
            assert float(sale1["total_amount"]) == 120.0
            assert sale1["items"][0]["base_quantity"] == 30
            print("✓ Sale 1: 1 Box sold at 120.00 EGP, 30 base units deducted")

            # Check remaining stock: 60 - 30 = 30
            med_stock_resp = client.get(f"/medicines/{med_3level_id}", headers=headers)
            assert med_stock_resp.json()["total_stock"] == 30
            print("✓ Remaining stock: 30 base units")

            # Sale 2: Sell 1 Strip (with overridden price 42.00 EGP)
            sale2_payload = {
                "payment_method": "cash",
                "discount": 0.0,
                "items": [
                    {
                        "medicine_id": med_3level_id,
                        "package_unit_id": strip_unit_id,
                        "quantity": 1,
                    }
                ],
            }
            s2_resp = client.post("/sales", json=sale2_payload, headers=headers)
            assert s2_resp.status_code == 201, f"Sale 2 failed: {s2_resp.text}"
            sale2 = s2_resp.json()
            test_sale_ids.append(sale2["id"])
            assert float(sale2["total_amount"]) == 42.0, f"Expected 42.00, got {sale2['total_amount']}"
            assert sale2["items"][0]["base_quantity"] == 10
            print("✓ Sale 2: 1 Strip sold at overridden price 42.00 EGP, 10 base units deducted")

            # Check remaining stock: 30 - 10 = 20
            med_stock_resp = client.get(f"/medicines/{med_3level_id}", headers=headers)
            assert med_stock_resp.json()["total_stock"] == 20
            print("✓ Remaining stock: 20 base units")

            # Sale 3: Sell 2 Units (tablets) at 4.00 EGP each = 8.00 EGP
            sale3_payload = {
                "payment_method": "cash",
                "discount": 0.0,
                "items": [
                    {
                        "medicine_id": med_3level_id,
                        "package_unit_id": unit_unit_id,
                        "quantity": 2,
                    }
                ],
            }
            s3_resp = client.post("/sales", json=sale3_payload, headers=headers)
            assert s3_resp.status_code == 201, f"Sale 3 failed: {s3_resp.text}"
            sale3 = s3_resp.json()
            test_sale_ids.append(sale3["id"])
            assert float(sale3["total_amount"]) == 8.0
            assert sale3["items"][0]["base_quantity"] == 2
            print("✓ Sale 3: 2 Units sold at 8.00 EGP, 2 base units deducted")

            # Check remaining stock: 20 - 2 = 18
            med_stock_resp = client.get(f"/medicines/{med_3level_id}", headers=headers)
            assert med_stock_resp.json()["total_stock"] == 18
            print("✓ Remaining stock: 18 base units")

            # -------------------------------------------------------------------
            # Test 7: Verify Inventory Movement Ledger
            # -------------------------------------------------------------------
            print("\n--- Test 7: Verifying Inventory Movements Ledger ---")
            mov_resp = client.get(f"/inventory/movements?medicine_id={med_3level_id}", headers=headers)
            assert mov_resp.status_code == 200, f"Movements fetch failed: {mov_resp.text}"
            movements = mov_resp.json()
            sale_movements = [m for m in movements if m["reason"] == "sale"]
            sale_changes = [m["quantity_change"] for m in sale_movements]
            print(f"Recorded sale movements (base units): {sale_changes}")
            assert -30 in sale_changes, "Missing -30 Box sale movement"
            assert -10 in sale_changes, "Missing -10 Strip sale movement"
            assert -2 in sale_changes, "Missing -2 Unit sale movement"
            print("✓ Inventory movements ledger accurately logged: -30, -10, -2 base units")

            # -------------------------------------------------------------------
            # Test 8: Sales Return and Inventory Restocking
            # -------------------------------------------------------------------
            print("\n--- Test 8: Sales Return and Restocking ---")
            # Return the 1 Strip sold in Sale 2
            strip_sale_item_id = sale2["items"][0]["id"]
            return_payload = {
                "sale_item_id": strip_sale_item_id,
                "quantity": 1,
                "reason": "Customer changed mind",
                "restock": True,
            }
            ret_resp = client.post("/sales/returns", json=return_payload, headers=headers)
            assert ret_resp.status_code in (200, 201), f"Return failed: {ret_resp.text}"
            print("✓ Successfully returned 1 Strip")

            # Check stock after return: 18 + 10 = 28 base units
            med_stock_resp = client.get(f"/medicines/{med_3level_id}", headers=headers)
            assert med_stock_resp.json()["total_stock"] == 28, f"Expected 28 base units, got {med_stock_resp.json()['total_stock']}"
            print("✓ Restocked accurately: stock is now 28 base units")

            # -------------------------------------------------------------------
            # Test 9: Fractional Quantity & Stock Under-Deduction Protection
            # -------------------------------------------------------------------
            print("\n--- Test 9: Fractional Quantity Under-Deduction Protection ---")
            # Attempt to pass float quantity via raw request
            raw_bad_payload = {
                "payment_method": "cash",
                "discount": 0.0,
                "items": [
                    {
                        "medicine_id": med_3level_id,
                        "package_unit_id": strip_unit_id,
                        "quantity": 0.5,  # Invalid fractional quantity
                    }
                ],
            }
            bad_resp = client.post("/sales", json=raw_bad_payload, headers=headers)
            assert bad_resp.status_code in (400, 422), f"Expected 400/422 for fractional quantity, got {bad_resp.status_code}"
            print(f"✓ API correctly rejected invalid fractional quantity with HTTP {bad_resp.status_code}")

        finally:
            # -------------------------------------------------------------------
            # Cleanup: Remove test data to keep database pristine
            # -------------------------------------------------------------------
            print("\n--- Cleanup: Purging Test Data ---")
            from app.core.database import SessionLocal
            from app.models.sale import Sale, SaleItem, SaleReturn
            from app.models.inventory_movement import InventoryMovement
            from app.models.medicine import Medicine, MedicineBatch, MedicinePackageUnit

            db = SessionLocal()
            try:
                for sid in test_sale_ids:
                    sale_uuid = uuid.UUID(sid)
                    item_ids = [item.id for item in db.query(SaleItem).filter(SaleItem.sale_id == sale_uuid).all()]
                    db.query(SaleReturn).filter(SaleReturn.sale_item_id.in_(item_ids)).delete(synchronize_session=False)
                    db.query(InventoryMovement).filter(InventoryMovement.reference_id == sale_uuid).delete(synchronize_session=False)
                    db.query(SaleItem).filter(SaleItem.sale_id == sale_uuid).delete(synchronize_session=False)
                    db.query(Sale).filter(Sale.id == sale_uuid).delete(synchronize_session=False)

                for mid in test_med_ids:
                    med_uuid = uuid.UUID(mid)
                    db.query(InventoryMovement).filter(InventoryMovement.medicine_id == med_uuid).delete(synchronize_session=False)
                    db.query(MedicineBatch).filter(MedicineBatch.medicine_id == med_uuid).delete(synchronize_session=False)
                    db.query(MedicinePackageUnit).filter(MedicinePackageUnit.medicine_id == med_uuid).delete(synchronize_session=False)
                    db.query(Medicine).filter(Medicine.id == med_uuid).delete(synchronize_session=False)

                db.commit()
                print("✓ All test records purged. Database restored to pristine state.")
            except Exception as e:
                db.rollback()
                print(f"! Error during cleanup: {e}")
            finally:
                db.close()

    print("\n=======================================================")
    print("ALL END-TO-END PACKAGING & PRICING TESTS PASSED 100%!")
    print("=======================================================")

if __name__ == "__main__":
    run_tests()
