"""
Read-Only Operational Readiness Verification Script.
Tests:
1. English search (/medicines?q=Voltaren)
2. Arabic search (/medicines?q=فولتارين)
3. Medicine detail endpoint (/medicines/{id}) for packaging and prices
4. POS search behavior
5. Barcode scan safety (/medicines/barcode/{barcode})
"""
import sys
import json
import httpx
from sqlalchemy import select

sys.path.insert(0, "/code")

from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.models.user import User
from app.models.medicine import Medicine

API_BASE = "http://localhost:8000"

print("======================================================================")
print("  OPERATIONAL READINESS READ-ONLY AUDIT")
print("======================================================================")

db = SessionLocal()
admin = db.scalar(select(User).where(User.username == "admin"))
if not admin:
    print("[ERROR] Admin user not found")
    sys.exit(1)

token = create_access_token(subject=str(admin.id), role=admin.role.value)
headers = {"Authorization": f"Bearer {token}"}
print(f"✓ Authenticated as '{admin.username}'")

# 1. Search English Name
print("\n[Test 1/5] Testing English Name Search (/medicines?q=Voltaren)...")
r_en = httpx.get(f"{API_BASE}/medicines?q=Voltaren", headers=headers, timeout=10.0)
assert r_en.status_code == 200, f"Failed: {r_en.status_code}"
items_en = r_en.json()
print(f"✓ English search 'Voltaren' returned {len(items_en)} results:")
for it in items_en[:3]:
    print(f"   - [{it['sku']}] {it['name']} ({it.get('name_ar')}) | Price: {it['selling_price']} EGP | Stock: {it['total_stock']}")
assert len(items_en) > 0, "English search must return results!"

# 2. Search Arabic Name
print("\n[Test 2/5] Testing Arabic Name Search (/medicines?q=فولتارين)...")
r_ar = httpx.get(f"{API_BASE}/medicines?q=فولتارين", headers=headers, timeout=10.0)
assert r_ar.status_code == 200, f"Failed: {r_ar.status_code}"
items_ar = r_ar.json()
print(f"✓ Arabic search 'فولتارين' returned {len(items_ar)} results:")
for it in items_ar[:3]:
    print(f"   - [{it['sku']}] {it['name']} ({it.get('name_ar')}) | Price: {it['selling_price']} EGP | Stock: {it['total_stock']}")
assert len(items_ar) > 0, "Arabic search must return results!"

# 3. Medicine Detail Page & Packaging Unit
print("\n[Test 3/5] Testing Medicine Detail & Packaging Units (/medicines/{id})...")
sample_med_id = items_en[0]["id"]
r_det = httpx.get(f"{API_BASE}/medicines/{sample_med_id}", headers=headers, timeout=10.0)
assert r_det.status_code == 200, f"Failed: {r_det.status_code}"
med_detail = r_det.json()
print(f"✓ Medicine Detail for '{med_detail['name']}':")
print(f"   SKU:             {med_detail['sku']}")
print(f"   Name (AR):       {med_detail.get('name_ar')}")
print(f"   Generic Name:    {med_detail.get('generic_name')}")
print(f"   Selling Price:   {med_detail['selling_price']} EGP")
print(f"   Purchase Price:  {med_detail['purchase_price']} EGP")
print(f"   Package Units ({len(med_detail.get('package_units', []))}):")
for pkg in med_detail.get("package_units", []):
    print(f"     * Unit: '{pkg['unit_name_en']}' (Factor: {pkg['conversion_factor']}, Sell: {pkg['selling_price']}, Cost: {pkg['purchase_price']}, Base: {pkg['is_base_unit']})")
assert len(med_detail.get("package_units", [])) >= 1, "Must have at least 1 packaging unit!"
base_pkg = med_detail["package_units"][0]
assert base_pkg["is_base_unit"] is True, "Packaging unit must be base unit!"
assert float(base_pkg["conversion_factor"]) == 1.0, "Conversion factor must be 1.0!"

# 4. POS Search Simulation
print("\n[Test 4/5] Testing POS Product Search Simulation...")
# POS searches general catalog by name
r_pos = httpx.get(f"{API_BASE}/medicines?query=Zincoderm", headers=headers, timeout=10.0)
assert r_pos.status_code == 200
pos_items = r_pos.json()
print(f"✓ POS search for 'Zincoderm' returned {len(pos_items)} item(s):")
for it in pos_items:
    print(f"   - Name: {it['name']}, Dispense Unit: {it.get('base_unit_name')}, Selling Price: {it['selling_price']} EGP, Current Stock: {it['total_stock']}")
assert len(pos_items) > 0, "POS search must find Zincoderm"

# 5. Barcode Scan Safety
print("\n[Test 5/5] Testing Barcode Scanner Safety (/medicines/barcode/{code})...")
# Scanning non-existent barcode
r_scan = httpx.get(f"{API_BASE}/medicines/barcode/9999999999999", headers=headers, timeout=10.0)
print(f"✓ Scan random barcode '9999999999999' -> Status: {r_scan.status_code} ({r_scan.json().get('detail')})")
assert r_scan.status_code == 404, "Unknown barcode must safely return 404 Not Found"

# Scanning whitespace barcode
r_scan_empty = httpx.get(f"{API_BASE}/medicines/barcode/%20", headers=headers, timeout=10.0)
print(f"✓ Scan whitespace barcode ' ' -> Status: {r_scan_empty.status_code} ({r_scan_empty.json().get('detail')})")
assert r_scan_empty.status_code == 404, "Empty barcode scan must safely return 404 Not Found"

db.close()
print("\n======================================================================")
print("  OPERATIONAL READINESS AUDIT: 100% PASSED")
print("======================================================================")

