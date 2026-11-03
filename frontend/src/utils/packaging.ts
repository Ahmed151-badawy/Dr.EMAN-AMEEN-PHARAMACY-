import { MedicinePackageUnit } from "../types";

/**
 * Breakdown base stock into readable packaging hierarchy (e.g., 5 Boxes + 1 Strip (110 Tablets)).
 */
export function formatPackagingBreakdown(
  baseQuantity: number,
  packageUnits?: MedicinePackageUnit[] | null,
  isArabic: boolean = false,
  fallbackBaseUnit: string = "Unit"
): string {
  if (baseQuantity <= 0) {
    const baseName =
      packageUnits?.find((u) => u.is_base_unit)?.[isArabic ? "unit_name_ar" : "unit_name_en"] ||
      fallbackBaseUnit;
    return `0 ${baseName}`;
  }

  if (!packageUnits || packageUnits.length === 0) {
    return `${baseQuantity} ${fallbackBaseUnit}`;
  }

  // Filter active units and sort by conversion factor descending
  const sortedUnits = [...packageUnits]
    .filter((u) => u.is_active !== false && Number(u.conversion_factor) > 0)
    .sort((a, b) => Number(b.conversion_factor) - Number(a.conversion_factor));

  if (sortedUnits.length <= 1) {
    const unit = sortedUnits[0];
    const unitName = unit ? (isArabic ? unit.unit_name_ar : unit.unit_name_en) : fallbackBaseUnit;
    return `${baseQuantity} ${unitName}`;
  }

  let remaining = Math.floor(baseQuantity);
  const parts: string[] = [];

  for (const unit of sortedUnits) {
    const factor = Math.floor(Number(unit.conversion_factor));
    if (factor <= 0) continue;

    const count = Math.floor(remaining / factor);
    if (count > 0) {
      const name = isArabic ? unit.unit_name_ar : unit.unit_name_en;
      parts.push(`${count} ${name}`);
      remaining %= factor;
    }
  }

  const baseUnit = sortedUnits.find((u) => u.is_base_unit) || sortedUnits[sortedUnits.length - 1];
  const baseName = isArabic ? baseUnit.unit_name_ar : baseUnit.unit_name_en;

  if (parts.length === 0) {
    return `${baseQuantity} ${baseName}`;
  }

  const hierarchyStr = parts.join(isArabic ? " + " : " + ");
  // If the breakdown is more than one unit or not in pure base units, append total base units
  if (parts.length > 1 || Number(sortedUnits[0].conversion_factor) > 1) {
    return `${hierarchyStr} (${baseQuantity} ${baseName})`;
  }

  return hierarchyStr;
}

/**
 * Get the default dispensing unit for a medicine.
 */
export function getDefaultDispenseUnit(
  packageUnits?: MedicinePackageUnit[] | null
): MedicinePackageUnit | null {
  if (!packageUnits || packageUnits.length === 0) return null;

  const activeUnits = packageUnits.filter((u) => u.is_active !== false && u.allow_selling !== false);
  if (activeUnits.length === 0) return packageUnits[0] || null;

  return (
    activeUnits.find((u) => u.is_default_dispense) ||
    activeUnits.find((u) => u.is_base_unit) ||
    activeUnits[0]
  );
}

/**
 * Format unit name with its conversion factor for display in selectors.
 */
export function getUnitOptionLabel(
  unit: MedicinePackageUnit,
  isArabic: boolean = false,
  baseUnitName?: string
): string {
  const name = isArabic ? unit.unit_name_ar : unit.unit_name_en;
  const factor = Number(unit.conversion_factor);

  if (unit.is_base_unit || factor === 1) {
    return `${name} (${isArabic ? "الوحدة الأساسية" : "Base Unit"})`;
  }

  const base = baseUnitName || (isArabic ? "وحدة" : "unit");
  return `${name} (x${factor} ${base})`;
}

/* ------------------------------------------------------------------ *
 *  Predefined Packaging Definitions & Dosage Form Helpers
 * ------------------------------------------------------------------ */

export type PredefinedUnitKey = "box" | "strip" | "unit";

export interface PredefinedUnitDefinition {
  key: PredefinedUnitKey;
  nameEn: string;
  nameAr: string;
}

export const PREDEFINED_UNITS: Record<PredefinedUnitKey, PredefinedUnitDefinition> = {
  box: { key: "box", nameEn: "Box", nameAr: "علبة" },
  strip: { key: "strip", nameEn: "Strip", nameAr: "شريط" },
  unit: { key: "unit", nameEn: "Unit", nameAr: "وحدة" },
};

/**
 * Format contextual label for the unit based on dosage form (e.g. Unit - Tablet / قرص).
 * Underlying packaging option remains strictly Box, Strip, or Unit.
 */
export function getContextualUnitDisplay(
  unitKey: PredefinedUnitKey,
  formOrDosage?: string | null,
  isArabic: boolean = false
): string {
  const def = PREDEFINED_UNITS[unitKey];
  if (!def) return unitKey;
  if (unitKey !== "unit") {
    return isArabic ? `${def.nameAr} (${def.nameEn})` : `${def.nameEn} (${def.nameAr})`;
  }

  const raw = (formOrDosage || "").toLowerCase().trim();
  let subAr = "قرص/قطعة";
  let subEn = "Tablet/Piece";

  if (raw.includes("tablet") || raw.includes("قرص")) {
    subAr = "قرص";
    subEn = "Tablet";
  } else if (raw.includes("capsule") || raw.includes("كبسول")) {
    subAr = "كبسولة";
    subEn = "Capsule";
  } else if (raw.includes("ampoule") || raw.includes("أمبول") || raw.includes("امبول")) {
    subAr = "أمبول";
    subEn = "Ampoule";
  } else if (raw.includes("vial") || raw.includes("فيال")) {
    subAr = "فيال";
    subEn = "Vial";
  } else if (raw.includes("sachet") || raw.includes("كيس") || raw.includes("فوار")) {
    subAr = "كيس";
    subEn = "Sachet";
  } else if (raw.includes("suppository") || raw.includes("لبوس")) {
    subAr = "لبوسة";
    subEn = "Suppository";
  } else if (
    raw.includes("syrup") ||
    raw.includes("suspension") ||
    raw.includes("شراب") ||
    raw.includes("معلق") ||
    raw.includes("bottle") ||
    raw.includes("زجاجة")
  ) {
    subAr = "زجاجة";
    subEn = "Bottle";
  } else if (raw.includes("drop") || raw.includes("قطرة") || raw.includes("نقط")) {
    subAr = "قطارة / زجاجة";
    subEn = "Dropper";
  } else if (
    raw.includes("cream") ||
    raw.includes("ointment") ||
    raw.includes("gel") ||
    raw.includes("كريم") ||
    raw.includes("مرهم") ||
    raw.includes("جل") ||
    raw.includes("أنبوبة")
  ) {
    subAr = "أنبوبة";
    subEn = "Tube";
  } else if (raw.includes("spray") || raw.includes("inhaler") || raw.includes("بخاخ")) {
    subAr = "بخاخ";
    subEn = "Inhaler/Spray";
  }

  return isArabic
    ? `${def.nameAr} [${subAr}] (${def.nameEn} [${subEn}])`
    : `${def.nameEn} [${subEn}] (${def.nameAr} [${subAr}])`;
}

/* ------------------------------------------------------------------ *
 *  Hierarchy Templates & State
 * ------------------------------------------------------------------ */

export type HierarchyTemplate = "box_strip_unit" | "box_unit" | "single_unit";

export interface PackagingUnitConfig {
  unitType: PredefinedUnitKey;
  unitNameEn: string;
  unitNameAr: string;
  conversionFactor: number;
  sellingPrice: number;
  costPrice: number;
  isCustomSellingPrice: boolean;
  isCustomCostPrice: boolean;
  barcode: string;
  allowSelling: boolean;
  isDefaultDispense: boolean;
  isBaseUnit: boolean;
}

export interface PackagingForm {
  template: HierarchyTemplate;
  stripsPerBox: number;
  unitsPerStrip: number;
  unitsPerBox: number;

  stripSellingPrice: number;
  stripCostPrice: number;
  boxSellingPrice: number;
  boxCostPrice: number;

  units: PackagingUnitConfig[];
  extraUnits: MedicinePackageUnit[];

  // Legacy compatibility fields
  stripNameEn?: string;
  stripNameAr?: string;
  stripBarcode?: string;
  hasBox?: boolean;
  boxNameEn?: string;
  boxNameAr?: string;
  boxPriceOverride?: number | null;
  boxCostOverride?: number | null;
  boxBarcode?: string;
  hasUnit?: boolean;
  unitNameEn?: string;
  unitNameAr?: string;
  unitPriceOverride?: number | null;
  unitCostOverride?: number | null;
  unitBarcode?: string;
  defaultDispense?: "box" | "strip" | "unit";
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const wholeAtLeast1 = (n: number) => Math.max(1, Math.floor(Number(n) || 1));

/**
 * Infer default template from dosage form / medicine form.
 */
export function inferTemplateFromDosage(formOrDosage?: string | null): HierarchyTemplate {
  const raw = (formOrDosage || "").toLowerCase().trim();
  if (!raw) return "box_strip_unit";

  if (
    raw.includes("syrup") ||
    raw.includes("suspension") ||
    raw.includes("شراب") ||
    raw.includes("معلق") ||
    raw.includes("drop") ||
    raw.includes("قطرة") ||
    raw.includes("نقط") ||
    raw.includes("cream") ||
    raw.includes("ointment") ||
    raw.includes("gel") ||
    raw.includes("كريم") ||
    raw.includes("مرهم") ||
    raw.includes("spray") ||
    raw.includes("inhaler") ||
    raw.includes("بخاخ")
  ) {
    return "single_unit";
  }

  if (
    raw.includes("ampoule") ||
    raw.includes("أمبول") ||
    raw.includes("امبول") ||
    raw.includes("vial") ||
    raw.includes("فيال") ||
    raw.includes("sachet") ||
    raw.includes("كيس") ||
    raw.includes("suppository") ||
    raw.includes("لبوس")
  ) {
    return "box_unit";
  }

  return "box_strip_unit";
}

export function autoBoxPrice(stripPrice: number, p: PackagingForm): number {
  return round2((Number(stripPrice) || 0) * wholeAtLeast1(p.stripsPerBox));
}

export function autoUnitPrice(stripPrice: number, p: PackagingForm): number {
  return round2((Number(stripPrice) || 0) / wholeAtLeast1(p.unitsPerStrip));
}

/**
 * Generate packaging units deterministically from entered quantities and source box price.
 * Preserves manual price overrides and barcode values.
 */
export function generateHierarchyUnits(
  template: HierarchyTemplate,
  stripsPerBoxInput: number,
  unitsPerStripInput: number,
  unitsPerBoxInput: number,
  boxSellingPriceInput: number,
  boxCostPriceInput: number,
  existingUnits?: PackagingUnitConfig[],
  _formOrDosage?: string | null,
  stripSellingPriceInput?: number,
  stripCostPriceInput?: number
): PackagingUnitConfig[] {
  const boxSelling = round2(boxSellingPriceInput);
  const boxCost = round2(boxCostPriceInput);
  const S = wholeAtLeast1(stripsPerBoxInput);
  const U_strip = wholeAtLeast1(unitsPerStripInput);
  const U_box = wholeAtLeast1(unitsPerBoxInput);

  const prevBox = existingUnits?.find((u) => u.unitType === "box");
  const prevStrip = existingUnits?.find((u) => u.unitType === "strip");
  const prevUnit = existingUnits?.find((u) => u.unitType === "unit");

  if (template === "box_strip_unit") {
    // 3-Level: Strip (Primary Dispense) ──▶ Box (Wholesale) ──▶ Unit (Base Inventory)
    const boxFactor = S * U_strip;
    const stripFactor = U_strip;
    const unitFactor = 1;

    let autoStripSell: number;
    let autoStripCost: number;
    let autoBoxSell: number;
    let autoBoxCost: number;
    let autoUnitSell: number;
    let autoUnitCost: number;

    if (stripSellingPriceInput !== undefined && stripSellingPriceInput > 0) {
      // Derive Box and Unit from primary Strip price
      autoStripSell = round2(stripSellingPriceInput);
      autoStripCost = stripCostPriceInput !== undefined ? round2(stripCostPriceInput) : round2(boxCost / S);
      autoBoxSell = round2(autoStripSell * S);
      autoBoxCost = round2(autoStripCost * S);
      autoUnitSell = round2(autoStripSell / U_strip);
      autoUnitCost = round2(autoStripCost / U_strip);
    } else {
      // Fallback: derive Strip and Unit from Box price
      autoStripSell = round2(boxSelling / S);
      autoStripCost = round2(boxCost / S);
      autoBoxSell = boxSelling;
      autoBoxCost = boxCost;
      autoUnitSell = round2(autoStripSell / U_strip);
      autoUnitCost = round2(autoStripCost / U_strip);
    }

    const stripSell = prevStrip?.isCustomSellingPrice ? prevStrip.sellingPrice : autoStripSell;
    const stripC = prevStrip?.isCustomCostPrice ? prevStrip.costPrice : autoStripCost;

    const boxSell = prevBox?.isCustomSellingPrice ? prevBox.sellingPrice : autoBoxSell;
    const boxC = prevBox?.isCustomCostPrice ? prevBox.costPrice : autoBoxCost;

    const unitSell = prevUnit?.isCustomSellingPrice ? prevUnit.sellingPrice : autoUnitSell;
    const unitC = prevUnit?.isCustomCostPrice ? prevUnit.costPrice : autoUnitCost;

    const defaultTarget = prevBox?.isDefaultDispense
      ? "box"
      : prevUnit?.isDefaultDispense
      ? "unit"
      : "strip";

    // Hierarchy Order: Strip (Primary) ──▶ Box (Full pack) ──▶ Unit (Base Inventory)
    return [
      {
        unitType: "strip",
        unitNameEn: "Strip",
        unitNameAr: "شريط",
        conversionFactor: stripFactor,
        sellingPrice: stripSell,
        costPrice: stripC,
        isCustomSellingPrice: !!prevStrip?.isCustomSellingPrice && stripSell !== autoStripSell,
        isCustomCostPrice: !!prevStrip?.isCustomCostPrice && stripC !== autoStripCost,
        barcode: prevStrip?.barcode || "",
        allowSelling: prevStrip ? prevStrip.allowSelling : true,
        isDefaultDispense: defaultTarget === "strip",
        isBaseUnit: false,
      },
      {
        unitType: "box",
        unitNameEn: "Box",
        unitNameAr: "علبة",
        conversionFactor: boxFactor,
        sellingPrice: boxSell,
        costPrice: boxC,
        isCustomSellingPrice: !!prevBox?.isCustomSellingPrice && boxSell !== autoBoxSell,
        isCustomCostPrice: !!prevBox?.isCustomCostPrice && boxC !== autoBoxCost,
        barcode: prevBox?.barcode || "",
        allowSelling: prevBox ? prevBox.allowSelling : true,
        isDefaultDispense: defaultTarget === "box",
        isBaseUnit: false,
      },
      {
        unitType: "unit",
        unitNameEn: "Unit",
        unitNameAr: "وحدة",
        conversionFactor: unitFactor,
        sellingPrice: unitSell,
        costPrice: unitC,
        isCustomSellingPrice: !!prevUnit?.isCustomSellingPrice && unitSell !== autoUnitSell,
        isCustomCostPrice: !!prevUnit?.isCustomCostPrice && unitC !== autoUnitCost,
        barcode: prevUnit?.barcode || "",
        allowSelling: prevUnit ? prevUnit.allowSelling : true,
        isDefaultDispense: defaultTarget === "unit",
        isBaseUnit: true,
      },
    ];
  }

  if (template === "box_unit") {
    // 2-Level: Box → Unit (e.g. Box of Ampoules, Sachets)
    const boxFactor = U_box;
    const unitFactor = 1;

    const autoUnitSell = round2(boxSelling / U_box);
    const autoUnitCost = round2(boxCost / U_box);

    const boxSell = prevBox?.isCustomSellingPrice ? prevBox.sellingPrice : boxSelling;
    const boxC = prevBox?.isCustomCostPrice ? prevBox.costPrice : boxCost;

    const unitSell = prevUnit?.isCustomSellingPrice ? prevUnit.sellingPrice : autoUnitSell;
    const unitC = prevUnit?.isCustomCostPrice ? prevUnit.costPrice : autoUnitCost;

    const defaultTarget = prevUnit?.isDefaultDispense ? "unit" : "box";

    return [
      {
        unitType: "box",
        unitNameEn: "Box",
        unitNameAr: "علبة",
        conversionFactor: boxFactor,
        sellingPrice: boxSell,
        costPrice: boxC,
        isCustomSellingPrice: !!prevBox?.isCustomSellingPrice && boxSell !== boxSelling,
        isCustomCostPrice: !!prevBox?.isCustomCostPrice && boxC !== boxCost,
        barcode: prevBox?.barcode || "",
        allowSelling: prevBox ? prevBox.allowSelling : true,
        isDefaultDispense: defaultTarget === "box",
        isBaseUnit: false,
      },
      {
        unitType: "unit",
        unitNameEn: "Unit",
        unitNameAr: "وحدة",
        conversionFactor: unitFactor,
        sellingPrice: unitSell,
        costPrice: unitC,
        isCustomSellingPrice: !!prevUnit?.isCustomSellingPrice && unitSell !== autoUnitSell,
        isCustomCostPrice: !!prevUnit?.isCustomCostPrice && unitC !== autoUnitCost,
        barcode: prevUnit?.barcode || "",
        allowSelling: prevUnit ? prevUnit.allowSelling : true,
        isDefaultDispense: defaultTarget === "unit",
        isBaseUnit: true,
      },
    ];
  }

  // 1-Level: Single Unit (e.g. Syrup bottle, Ointment tube)
  const singleSell = prevUnit?.isCustomSellingPrice ? prevUnit.sellingPrice : boxSelling;
  const singleC = prevUnit?.isCustomCostPrice ? prevUnit.costPrice : boxCost;

  return [
    {
      unitType: "unit",
      unitNameEn: "Unit",
      unitNameAr: "وحدة",
      conversionFactor: 1,
      sellingPrice: singleSell,
      costPrice: singleC,
      isCustomSellingPrice: !!prevUnit?.isCustomSellingPrice && singleSell !== boxSelling,
      isCustomCostPrice: !!prevUnit?.isCustomCostPrice && singleC !== boxCost,
      barcode: prevUnit?.barcode || prevBox?.barcode || "",
      allowSelling: true,
      isDefaultDispense: true,
      isBaseUnit: true,
    },
  ];
}

/**
 * Creates a default PackagingForm instance.
 */
export function defaultPackagingForm(formOrDosage?: string | null): PackagingForm {
  const template = inferTemplateFromDosage(formOrDosage);
  const stripsPerBox = 3;
  const unitsPerStrip = 10;
  const unitsPerBox = 5;
  const stripSellingPrice = 40;
  const stripCostPrice = 32;
  const boxSellingPrice = 120;
  const boxCostPrice = 96;

  const units = generateHierarchyUnits(
    template,
    stripsPerBox,
    unitsPerStrip,
    unitsPerBox,
    boxSellingPrice,
    boxCostPrice,
    undefined,
    formOrDosage,
    stripSellingPrice,
    stripCostPrice
  );

  return {
    template,
    stripsPerBox,
    unitsPerStrip,
    unitsPerBox,
    stripSellingPrice,
    stripCostPrice,
    boxSellingPrice,
    boxCostPrice,
    units,
    extraUnits: [],
    // Compatibility fields
    stripNameEn: "Strip",
    stripNameAr: "شريط",
    stripBarcode: "",
    hasBox: template !== "single_unit",
    boxNameEn: "Box",
    boxNameAr: "علبة",
    boxPriceOverride: null,
    boxCostOverride: null,
    boxBarcode: "",
    hasUnit: true,
    unitNameEn: "Unit",
    unitNameAr: "وحدة",
    unitPriceOverride: null,
    unitCostOverride: null,
    unitBarcode: "",
    defaultDispense: template === "box_strip_unit" ? "strip" : "box",
  };
}

/**
 * Converts the UI PackagingForm into the array of MedicinePackageUnit required by backend API.
 */
export function buildPackageUnits(
  form: PackagingForm,
  _ignoredStripPrice?: number,
  _ignoredStripCost?: number
): MedicinePackageUnit[] {
  const result: MedicinePackageUnit[] = [];

  for (const u of form.units) {
    const def = PREDEFINED_UNITS[u.unitType] || PREDEFINED_UNITS.unit;
    result.push({
      unit_name_en: def.nameEn,
      unit_name_ar: def.nameAr,
      conversion_factor: Math.max(1, Math.round(u.conversionFactor)),
      selling_price: round2(u.sellingPrice),
      purchase_price: round2(u.costPrice),
      barcode: u.barcode.trim() || undefined,
      is_base_unit: u.isBaseUnit,
      is_default_dispense: u.isDefaultDispense,
      allow_selling: u.allowSelling,
      is_active: true,
    });
  }

  // Ensure exactly one base unit has conversion factor 1
  const baseUnits = result.filter((u) => u.is_base_unit);
  if (baseUnits.length === 0 && result.length > 0) {
    result[result.length - 1].is_base_unit = true;
    result[result.length - 1].conversion_factor = 1;
  }

  // Ensure exactly one default dispense unit
  const dispUnits = result.filter((u) => u.is_default_dispense && u.allow_selling);
  if (dispUnits.length === 0 && result.length > 0) {
    const cand = result.find((u) => u.allow_selling) || result[0];
    cand.is_default_dispense = true;
  }

  return [...result, ...form.extraUnits.map((u) => ({ ...u, is_base_unit: false, is_default_dispense: false }))];
}

/**
 * Rebuilds the PackagingForm from units saved on a medicine.
 */
export function packagingFromUnits(
  units?: MedicinePackageUnit[] | null,
  dosageFormOrForm?: string | null
): { form: PackagingForm; stripPrice: number; stripCost: number } {
  const form = defaultPackagingForm(dosageFormOrForm);
  const activeUnits = (units || [])
    .filter((u) => u.is_active !== false)
    .sort((a, b) => Number(b.conversion_factor) - Number(a.conversion_factor));

  if (!activeUnits || activeUnits.length === 0) {
    return { form, stripPrice: 0, stripCost: 0 };
  }

  const findUnitByType = (key: PredefinedUnitKey) => {
    const en = PREDEFINED_UNITS[key].nameEn.toLowerCase();
    const ar = PREDEFINED_UNITS[key].nameAr;
    return activeUnits.find(
      (u) =>
        u.unit_name_en.toLowerCase() === en ||
        u.unit_name_ar === ar ||
        (key === "unit" && (u.is_base_unit || Number(u.conversion_factor) === 1))
    );
  };

  const boxUnit = findUnitByType("box");
  const stripUnit = findUnitByType("strip");
  const baseUnit =
    findUnitByType("unit") ||
    activeUnits.find((u) => u.is_base_unit) ||
    activeUnits[activeUnits.length - 1];

  let template: HierarchyTemplate = "single_unit";
  if (boxUnit && stripUnit && baseUnit && boxUnit.id !== stripUnit.id && stripUnit.id !== baseUnit.id) {
    template = "box_strip_unit";
  } else if (boxUnit && baseUnit && boxUnit.id !== baseUnit.id) {
    template = "box_unit";
  } else if (stripUnit && baseUnit && stripUnit.id !== baseUnit.id) {
    template = "box_unit"; // 2 levels
  } else {
    template = "single_unit";
  }

  form.template = template;

  if (template === "box_strip_unit" && boxUnit && stripUnit && baseUnit) {
    const stripFactor = Math.max(1, Math.round(Number(stripUnit.conversion_factor)));
    const boxFactor = Math.max(stripFactor, Math.round(Number(boxUnit.conversion_factor)));
    form.unitsPerStrip = Math.max(1, stripFactor);
    form.stripsPerBox = Math.max(1, Math.round(boxFactor / stripFactor));
    form.stripSellingPrice = round2(Number(stripUnit.selling_price));
    form.stripCostPrice = round2(Number(stripUnit.purchase_price || 0));
    form.boxSellingPrice = round2(Number(boxUnit.selling_price));
    form.boxCostPrice = round2(Number(boxUnit.purchase_price || 0));

    const autoStripSell = round2(form.boxSellingPrice / form.stripsPerBox);
    const autoStripCost = round2(form.boxCostPrice / form.stripsPerBox);
    const autoUnitSell = round2(autoStripSell / form.unitsPerStrip);
    const autoUnitCost = round2(autoStripCost / form.unitsPerStrip);

    form.units = [
      {
        unitType: "strip",
        unitNameEn: "Strip",
        unitNameAr: "شريط",
        conversionFactor: stripFactor,
        sellingPrice: Number(stripUnit.selling_price),
        costPrice: Number(stripUnit.purchase_price || 0),
        isCustomSellingPrice: Math.abs(Number(stripUnit.selling_price) - autoStripSell) > 0.01,
        isCustomCostPrice: Math.abs(Number(stripUnit.purchase_price || 0) - autoStripCost) > 0.01,
        barcode: stripUnit.barcode || "",
        allowSelling: stripUnit.allow_selling !== false,
        isDefaultDispense: !!stripUnit.is_default_dispense,
        isBaseUnit: false,
      },
      {
        unitType: "box",
        unitNameEn: "Box",
        unitNameAr: "علبة",
        conversionFactor: boxFactor,
        sellingPrice: Number(boxUnit.selling_price),
        costPrice: Number(boxUnit.purchase_price || 0),
        isCustomSellingPrice: false,
        isCustomCostPrice: false,
        barcode: boxUnit.barcode || "",
        allowSelling: boxUnit.allow_selling !== false,
        isDefaultDispense: !!boxUnit.is_default_dispense,
        isBaseUnit: false,
      },
      {
        unitType: "unit",
        unitNameEn: "Unit",
        unitNameAr: "وحدة",
        conversionFactor: 1,
        sellingPrice: Number(baseUnit.selling_price),
        costPrice: Number(baseUnit.purchase_price || 0),
        isCustomSellingPrice: Math.abs(Number(baseUnit.selling_price) - autoUnitSell) > 0.01,
        isCustomCostPrice: Math.abs(Number(baseUnit.purchase_price || 0) - autoUnitCost) > 0.01,
        barcode: baseUnit.barcode || "",
        allowSelling: baseUnit.allow_selling !== false,
        isDefaultDispense: !!baseUnit.is_default_dispense,
        isBaseUnit: true,
      },
    ];
  } else if (template === "box_unit" && (boxUnit || stripUnit) && baseUnit) {
    const topUnit = boxUnit || stripUnit!;
    const topFactor = Math.max(1, Math.round(Number(topUnit.conversion_factor)));
    form.unitsPerBox = topFactor;
    form.boxSellingPrice = round2(Number(topUnit.selling_price));
    form.boxCostPrice = round2(Number(topUnit.purchase_price || 0));

    const autoUnitSell = round2(form.boxSellingPrice / form.unitsPerBox);
    const autoUnitCost = round2(form.boxCostPrice / form.unitsPerBox);

    form.units = [
      {
        unitType: "box",
        unitNameEn: "Box",
        unitNameAr: "علبة",
        conversionFactor: topFactor,
        sellingPrice: Number(topUnit.selling_price),
        costPrice: Number(topUnit.purchase_price || 0),
        isCustomSellingPrice: false,
        isCustomCostPrice: false,
        barcode: topUnit.barcode || "",
        allowSelling: topUnit.allow_selling !== false,
        isDefaultDispense: !!topUnit.is_default_dispense,
        isBaseUnit: false,
      },
      {
        unitType: "unit",
        unitNameEn: "Unit",
        unitNameAr: "وحدة",
        conversionFactor: 1,
        sellingPrice: Number(baseUnit.selling_price),
        costPrice: Number(baseUnit.purchase_price || 0),
        isCustomSellingPrice: Math.abs(Number(baseUnit.selling_price) - autoUnitSell) > 0.01,
        isCustomCostPrice: Math.abs(Number(baseUnit.purchase_price || 0) - autoUnitCost) > 0.01,
        barcode: baseUnit.barcode || "",
        allowSelling: baseUnit.allow_selling !== false,
        isDefaultDispense: !!baseUnit.is_default_dispense,
        isBaseUnit: true,
      },
    ];
  } else {
    const single = activeUnits[0];
    form.boxSellingPrice = round2(Number(single.selling_price));
    form.boxCostPrice = round2(Number(single.purchase_price || 0));
    form.units = [
      {
        unitType: "unit",
        unitNameEn: "Unit",
        unitNameAr: "وحدة",
        conversionFactor: 1,
        sellingPrice: Number(single.selling_price),
        costPrice: Number(single.purchase_price || 0),
        isCustomSellingPrice: false,
        isCustomCostPrice: false,
        barcode: single.barcode || "",
        allowSelling: true,
        isDefaultDispense: true,
        isBaseUnit: true,
      },
    ];
  }

  const stripPrice = form.units.find((u) => u.unitType === "strip")?.sellingPrice ?? form.boxSellingPrice;
  const stripCost = form.units.find((u) => u.unitType === "strip")?.costPrice ?? form.boxCostPrice;

  return { form, stripPrice, stripCost };
}

/**
 * Validates the PackagingForm before submission.
 */
export function validatePackaging(p: PackagingForm, isArabic: boolean): string | null {
  const msg = (en: string, ar: string) => (isArabic ? ar : en);

  if (p.template === "box_strip_unit") {
    if (!Number.isInteger(Number(p.stripsPerBox)) || Number(p.stripsPerBox) < 1) {
      return msg("Strips per box must be a whole number (1 or more)", "عدد الأشرطة في العلبة يجب أن يكون رقماً صحيحاً (1 أو أكثر)");
    }
    if (!Number.isInteger(Number(p.unitsPerStrip)) || Number(p.unitsPerStrip) < 1) {
      return msg("Units per strip must be a whole number (1 or more)", "عدد الوحدات في الشريط يجب أن يكون رقماً صحيحاً (1 أو أكثر)");
    }
  } else if (p.template === "box_unit") {
    if (!Number.isInteger(Number(p.unitsPerBox)) || Number(p.unitsPerBox) < 1) {
      return msg("Units per box must be a whole number (1 or more)", "عدد الوحدات في العلبة يجب أن يكون رقماً صحيحاً (1 أو أكثر)");
    }
  }

  if (p.units.length === 0) {
    return msg("At least one packaging unit must be configured", "يجب تكوين وحدة تعبئة واحدة على الأقل");
  }

  // Ensure unique unit types
  const unitTypes = p.units.map((u) => u.unitType);
  if (new Set(unitTypes).size !== unitTypes.length) {
    return msg("Duplicate packaging levels detected in hierarchy", "توجد مستويات تعبئة مكررة في التكوين");
  }

  // Check unique barcodes
  const barcodes = p.units
    .map((u) => u.barcode.trim())
    .filter(Boolean);
  if (new Set(barcodes).size !== barcodes.length) {
    return msg("Unit barcodes must be unique", "يجب أن تكون باركودات الوحدات مختلفة وغير مكررة");
  }

  // Check valid non-negative prices
  for (const u of p.units) {
    if (isNaN(u.sellingPrice) || u.sellingPrice < 0) {
      return msg(`Invalid selling price for ${u.unitNameEn}`, `سعر البيع غير صالح للوحدة: ${u.unitNameAr}`);
    }
    if (isNaN(u.costPrice) || u.costPrice < 0) {
      return msg(`Invalid cost price for ${u.unitNameEn}`, `سعر التكلفة غير صالح للوحدة: ${u.unitNameAr}`);
    }
  }

  // Check at least one unit allows selling
  if (!p.units.some((u) => u.allowSelling)) {
    return msg("At least one packaging level must be enabled for retail selling", "يجب السماح بالبيع لوحدة واحدة على الأقل");
  }

  // Check exactly one base unit
  const baseUnits = p.units.filter((u) => u.isBaseUnit);
  if (baseUnits.length !== 1) {
    return msg("Exactly one packaging level must be the base inventory unit", "يجب تحديد وحدة أساسية واحدة فقط للمخزون");
  }

  // Check exactly one default dispense unit
  const defaultUnits = p.units.filter((u) => u.isDefaultDispense);
  if (defaultUnits.length !== 1) {
    return msg("Exactly one packaging level must be the default selling unit", "يجب تحديد وحدة صرف افتراضية واحدة فقط");
  }

  return null;
}
