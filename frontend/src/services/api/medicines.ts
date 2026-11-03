import { apiRequest } from "./client";
import {
  Medicine,
  MedicineBatch,
  DrugFamily,
  DosageForm,
  ActiveIngredient,
  MedicinePackageUnit,
  ProductCategory,
  ProductSubcategory,
} from "../../types";

export interface MedicineScanResult {
  medicine: Medicine;
  total_stock: number;
  batches_fefo: MedicineBatch[];
  matched_unit?: MedicinePackageUnit | null;
}

export interface MedicineFilters {
  q?: string;
  query?: string;
  product_type?: string;
  category_id?: string;
  subcategory_id?: string;
  family_id?: string;
  dosage_form_id?: string;
  active_ingredient_id?: string;
  manufacturer?: string;
  requires_prescription?: boolean;
  is_controlled?: boolean;
  controlled_schedule?: string;
  stock_status?: string; // all, in_stock, low_stock, out_of_stock
  category?: string;
  active_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface PackageUnitInput {
  id?: string;
  unit_name_en: string;
  unit_name_ar: string;
  conversion_factor: number;
  selling_price: number;
  purchase_price?: number;
  barcode?: string | null;
  is_base_unit?: boolean;
  is_default_dispense?: boolean;
  allow_selling?: boolean;
  is_active?: boolean;
}

export interface ActiveIngredientInput {
  active_ingredient_id: string;
  strength_value?: number | null;
  strength_unit?: string | null;
  display_strength?: string | null;
}

export interface MedicineCreatePayload {
  name: string;
  name_ar?: string | null;
  generic_name?: string | null;
  barcode?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  dosage?: string | null;
  form?: string | null;
  drug_family_id?: string | null;
  dosage_form_id?: string | null;
  strength?: string | null;
  base_unit_name?: string;
  product_type?: string;
  category_id?: string | null;
  subcategory_id?: string | null;
  sku?: string | null;
  selling_price: number;
  purchase_price: number;
  minimum_stock?: number;
  requires_prescription?: boolean;
  is_controlled?: boolean;
  controlled_schedule?: string | null;
  active_ingredients?: ActiveIngredientInput[];
  package_units?: PackageUnitInput[];
}

export interface MedicineUpdatePayload {
  name?: string;
  name_ar?: string | null;
  generic_name?: string | null;
  barcode?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  dosage?: string | null;
  form?: string | null;
  drug_family_id?: string | null;
  dosage_form_id?: string | null;
  strength?: string | null;
  base_unit_name?: string;
  product_type?: string;
  category_id?: string | null;
  subcategory_id?: string | null;
  sku?: string | null;
  selling_price?: number;
  purchase_price?: number;
  minimum_stock?: number;
  requires_prescription?: boolean;
  is_controlled?: boolean;
  controlled_schedule?: string | null;
  is_active?: boolean;
  active_ingredients?: ActiveIngredientInput[];
  package_units?: PackageUnitInput[];
}

export interface BatchCreatePayload {
  batch_number?: string | null;
  expiry_date: string;
  quantity: number;
  purchase_price: number;
  supplier_id?: string | null;
}

export interface DrugFamilyCreatePayload {
  name_en: string;
  name_ar: string;
  code?: string | null;
  description?: string | null;
  is_active?: boolean;
}

export interface DrugFamilyUpdatePayload {
  name_en?: string;
  name_ar?: string;
  code?: string | null;
  description?: string | null;
  is_active?: boolean;
}

export interface DosageFormCreatePayload {
  name_en: string;
  name_ar: string;
  code?: string | null;
  is_active?: boolean;
}

export interface DosageFormUpdatePayload {
  name_en?: string;
  name_ar?: string;
  code?: string | null;
  is_active?: boolean;
}

export interface ActiveIngredientCreatePayload {
  name_en: string;
  name_ar?: string | null;
  description?: string | null;
  is_active?: boolean;
}

export interface ActiveIngredientUpdatePayload {
  name_en?: string;
  name_ar?: string | null;
  description?: string | null;
  is_active?: boolean;
}

export const medicinesApi = {
  list: async (filters: MedicineFilters = {}): Promise<Medicine[]> => {
    const params: Record<string, any> = { ...filters };
    if (params.query && !params.q) {
      params.q = params.query;
      delete params.query;
    }
    return apiRequest<Medicine[]>("/medicines", {
      params,
    });
  },

  get: async (id: string): Promise<Medicine> => {
    return apiRequest<Medicine>(`/medicines/${id}`);
  },

  create: async (data: MedicineCreatePayload): Promise<Medicine> => {
    return apiRequest<Medicine>("/medicines", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: MedicineUpdatePayload): Promise<Medicine> => {
    return apiRequest<Medicine>(`/medicines/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/medicines/${id}`, {
      method: "DELETE",
    });
  },

  scanBarcode: async (barcode: string): Promise<MedicineScanResult> => {
    return apiRequest<MedicineScanResult>(`/medicines/barcode/${encodeURIComponent(barcode)}`);
  },

  listBatches: async (medicineId: string): Promise<MedicineBatch[]> => {
    return apiRequest<MedicineBatch[]>(`/medicines/${medicineId}/batches`);
  },

  addBatch: async (medicineId: string, data: BatchCreatePayload): Promise<MedicineBatch> => {
    return apiRequest<MedicineBatch>(`/medicines/${medicineId}/batches`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Master Data Methods
  getDrugFamilies: async (activeOnly: boolean = true): Promise<DrugFamily[]> => {
    return apiRequest<DrugFamily[]>("/medicines/drug-families", {
      params: { active_only: activeOnly },
    });
  },

  createDrugFamily: async (data: DrugFamilyCreatePayload): Promise<DrugFamily> => {
    return apiRequest<DrugFamily>("/medicines/drug-families", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateDrugFamily: async (id: string, data: DrugFamilyUpdatePayload): Promise<DrugFamily> => {
    return apiRequest<DrugFamily>(`/medicines/drug-families/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  getCategories: async (activeOnly: boolean = true, productType?: string): Promise<ProductCategory[]> => {
    return apiRequest<ProductCategory[]>("/medicines/categories", {
      params: { active_only: activeOnly, product_type: productType },
    });
  },

  getDosageForms: async (
    activeOnly: boolean = true,
    category?: string,
    subtype?: string
  ): Promise<DosageForm[]> => {
    return apiRequest<DosageForm[]>("/medicines/dosage-forms", {
      params: { active_only: activeOnly, category, subtype },
    });
  },

  createDosageForm: async (data: DosageFormCreatePayload): Promise<DosageForm> => {
    return apiRequest<DosageForm>("/medicines/dosage-forms", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateDosageForm: async (id: string, data: DosageFormUpdatePayload): Promise<DosageForm> => {
    return apiRequest<DosageForm>(`/medicines/dosage-forms/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  getActiveIngredients: async (q?: string, activeOnly: boolean = true): Promise<ActiveIngredient[]> => {
    return apiRequest<ActiveIngredient[]>("/medicines/active-ingredients", {
      params: { q, active_only: activeOnly },
    });
  },

  createActiveIngredient: async (data: ActiveIngredientCreatePayload): Promise<ActiveIngredient> => {
    return apiRequest<ActiveIngredient>("/medicines/active-ingredients", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateActiveIngredient: async (id: string, data: ActiveIngredientUpdatePayload): Promise<ActiveIngredient> => {
    return apiRequest<ActiveIngredient>(`/medicines/active-ingredients/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },


  createCategory: async (data: {
    name_en: string;
    name_ar: string;
    code: string;
    description?: string;
  }): Promise<ProductCategory> => {
    return apiRequest<ProductCategory>("/medicines/categories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  createSubcategory: async (data: {
    category_id: string;
    name_en: string;
    name_ar: string;
    code?: string;
    description?: string;
  }): Promise<ProductSubcategory> => {
    return apiRequest<ProductSubcategory>("/medicines/subcategories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

