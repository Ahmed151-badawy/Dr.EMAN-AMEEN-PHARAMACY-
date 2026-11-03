// Unit verification script for packaging hierarchy & pricing rules
import {
  PREDEFINED_UNITS,
  generateHierarchyUnits,
  inferTemplateFromDosage,
  getContextualUnitDisplay,
  buildPackageUnits,
  packagingFromUnits,
  validatePackaging,
} from "./src/utils/packaging.js";

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exit(1);
  }
  console.log("PASS:", message);
}

console.log("--- 1. Testing Predefined Packaging Options ---");
assert(PREDEFINED_UNITS.box.nameEn === "Box" && PREDEFINED_UNITS.box.nameAr === "علبة", "Box definition exists");
assert(PREDEFINED_UNITS.strip.nameEn === "Strip" && PREDEFINED_UNITS.strip.nameAr === "شريط", "Strip definition exists");
assert(PREDEFINED_UNITS.unit.nameEn === "Unit" && PREDEFINED_UNITS.unit.nameAr === "وحدة", "Unit definition exists");

console.log("\n--- 2. Testing Contextual Dosage Form Labels ---");
const tabletLabel = getContextualUnitDisplay("unit", "Film-coated tablet", false);
assert(tabletLabel.includes("Tablet") && tabletLabel.includes("Unit"), `Tablet label formatted: ${tabletLabel}`);
const ampouleLabel = getContextualUnitDisplay("unit", "Ampoule injection", true);
assert(ampouleLabel.includes("أمبول") && ampouleLabel.includes("وحدة"), `Ampoule label formatted: ${ampouleLabel}`);
const syrupLabel = getContextualUnitDisplay("unit", "Syrup 100ml", true);
assert(ampouleLabel.includes("وحدة"), `Syrup label formatted: ${syrupLabel}`);

console.log("\n--- 3. Testing 3-Level Solid Oral (Box → Strip → Unit) ---");
// Example: Box price: 120 EGP, Strips per box: 3, Units per strip: 10
const boxPrice = 120;
const boxCost = 96;
const stripsPerBox = 3;
const unitsPerStrip = 10;

const units3 = generateHierarchyUnits("box_strip_unit", stripsPerBox, unitsPerStrip, 1, boxPrice, boxCost);
assert(units3.length === 3, "Generated 3 units");
assert(units3[0].unitType === "strip", "First unit in 3-level is Strip (الشريط)");
assert(units3[1].unitType === "box", "Second unit in 3-level is Box (العلبة)");
assert(units3[2].unitType === "unit", "Third unit in 3-level is Unit (القرص)");

const box = units3.find((u) => u.unitType === "box");
const strip = units3.find((u) => u.unitType === "strip");
const unit = units3.find((u) => u.unitType === "unit");

assert(box.conversionFactor === 30, `Box conversion factor is 30 (got ${box.conversionFactor})`);
assert(strip.conversionFactor === 10, `Strip conversion factor is 10 (got ${strip.conversionFactor})`);
assert(unit.conversionFactor === 1, `Unit conversion factor is 1 (got ${unit.conversionFactor})`);
assert(unit.isBaseUnit === true, "Unit is base inventory unit");
assert(strip.isDefaultDispense === true, "Strip is default selling/dispensing unit");

// Suggested prices: Box=120, Strip=40, Unit=4
assert(box.sellingPrice === 120, `Box price is 120 (got ${box.sellingPrice})`);
assert(strip.sellingPrice === 40, `Suggested strip price is 40 (got ${strip.sellingPrice})`);
assert(unit.sellingPrice === 4, `Suggested unit price is 4 (got ${unit.sellingPrice})`);

// Test primary Strip price input: Strip=40 EGP -> Box=120 EGP, Unit=4 EGP
const unitsFromStrip = generateHierarchyUnits("box_strip_unit", 3, 10, 1, 0, 0, undefined, null, 40, 32);
assert(unitsFromStrip.find(u => u.unitType === "strip").sellingPrice === 40, "Strip primary price is 40");
assert(unitsFromStrip.find(u => u.unitType === "box").sellingPrice === 120, "Derived Box price is 120 (40 x 3)");
assert(unitsFromStrip.find(u => u.unitType === "unit").sellingPrice === 4, "Derived Unit price is 4 (40 / 10)");

// Suggested costs: Box=96, Strip=32, Unit=3.20
assert(box.costPrice === 96, `Box cost is 96 (got ${box.costPrice})`);
assert(strip.costPrice === 32, `Suggested strip cost is 32 (got ${strip.costPrice})`);
assert(unit.costPrice === 3.2, `Suggested unit cost is 3.20 (got ${unit.costPrice})`);

console.log("\n--- 4. Testing Manual Price Overrides & Preservation ---");
// Simulate pharmacist customizing strip price to 42 EGP
strip.sellingPrice = 42;
strip.isCustomSellingPrice = true;

// Recalculate when Box price changes to 150 EGP
const units3Recalc = generateHierarchyUnits("box_strip_unit", stripsPerBox, unitsPerStrip, 1, 150, boxCost, units3);
const boxRecalc = units3Recalc.find((u) => u.unitType === "box");
const stripRecalc = units3Recalc.find((u) => u.unitType === "strip");
const unitRecalc = units3Recalc.find((u) => u.unitType === "unit");

assert(boxRecalc.sellingPrice === 150, `Box updated to 150 (got ${boxRecalc.sellingPrice})`);
assert(stripRecalc.sellingPrice === 42, `Manual override of Strip price preserved at 42 (got ${stripRecalc.sellingPrice})`);
assert(stripRecalc.isCustomSellingPrice === true, "Strip remains flagged as custom price");
assert(unitRecalc.sellingPrice === 5, `Unit price recalculated from new box price 150/30 = 5 (got ${unitRecalc.sellingPrice})`);

console.log("\n--- 5. Testing 2-Level (Box → Unit, e.g. Ampoules) ---");
const units2 = generateHierarchyUnits("box_unit", 1, 1, 5, 100, 80);
assert(units2.length === 2, "Generated 2 units for box_unit");
const box2 = units2.find((u) => u.unitType === "box");
const unit2 = units2.find((u) => u.unitType === "unit");
assert(box2.conversionFactor === 5, `Box conversion factor is 5 (got ${box2.conversionFactor})`);
assert(unit2.conversionFactor === 1, `Unit conversion factor is 1 (got ${unit2.conversionFactor})`);
assert(box2.sellingPrice === 100, "Box price is 100");
assert(unit2.sellingPrice === 20, "Unit price is 100/5 = 20");
assert(box2.isDefaultDispense === true, "Box is default dispense for ampoules");
assert(unit2.isBaseUnit === true, "Unit is base inventory unit");

console.log("\n--- 6. Testing 1-Level (Single Unit, e.g. Syrups/Creams) ---");
const units1 = generateHierarchyUnits("single_unit", 1, 1, 1, 45, 36);
assert(units1.length === 1, "Generated 1 unit for single_unit");
assert(units1[0].conversionFactor === 1, "Conversion factor is 1");
assert(units1[0].sellingPrice === 45, "Selling price is 45");
assert(units1[0].isBaseUnit === true, "Base unit is true");
assert(units1[0].isDefaultDispense === true, "Default dispense is true");

console.log("\n--- 7. Testing Validation ---");
const validForm = {
  template: "box_strip_unit",
  stripsPerBox: 3,
  unitsPerStrip: 10,
  unitsPerBox: 1,
  boxSellingPrice: 120,
  boxCostPrice: 96,
  units: units3,
  extraUnits: [],
};
assert(validatePackaging(validForm, false) === null, "Valid form passes validation");

const invalidForm = {
  ...validForm,
  stripsPerBox: 0,
};
assert(validatePackaging(invalidForm, false) !== null, "Invalid stripsPerBox fails validation");

console.log("\n--- 8. Testing Build Package Units for Backend API ---");
const apiUnits = buildPackageUnits(validForm);
assert(apiUnits.length === 3, "Built 3 API package unit rows");
assert(apiUnits[0].unit_name_en === "Strip" && apiUnits[0].conversion_factor === 10, "Strip formatted for API (first in hierarchy)");
assert(apiUnits[1].unit_name_en === "Box" && apiUnits[1].conversion_factor === 30, "Box formatted for API (second in hierarchy)");
assert(apiUnits[2].unit_name_en === "Unit" && apiUnits[2].conversion_factor === 1, "Unit formatted for API (third in hierarchy)");

console.log("\nALL PACKAGING UNIT TESTS PASSED SUCCESSFULLY!");
