import { apiRequest } from "./client";
import { Sale, PaymentMethod, SaleStatus, SaleReturn } from "../../types";

export interface SaleItemRequest {
  medicine_id: string;
  quantity: number;
  package_unit_id?: string | null;
}

export interface SaleCreate {
  customer_id?: string | null;
  payment_method?: PaymentMethod;
  discount?: number;
  items: SaleItemRequest[];
  purchaser_name?: string | null;
  purchaser_id_number?: string | null;
  purchaser_phone?: string | null;
  prescription_reference?: string | null;
  doctor_name?: string | null;
  doctor_license?: string | null;
  prescription_date?: string | null;
}

export interface SaleItemOut {
  id: string;
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_number?: string | null;
  package_unit_id?: string | null;
  unit_name?: string | null;
  conversion_factor?: number;
  base_quantity?: number;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface SaleOut {
  id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  user_id?: string | null;
  total_amount: number;
  discount: number;
  payment_method: PaymentMethod;
  status: SaleStatus;
  created_at: string;
  items: SaleItemOut[];
}

export interface SaleFilters {
  customer_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export interface SaleReturnPayload {
  sale_item_id: string;
  quantity: number;
  reason?: string | null;
  restock?: boolean;
}

export const salesApi = {
  create: async (data: SaleCreate): Promise<SaleOut> => {
    return apiRequest<SaleOut>("/sales", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  list: async (filters: SaleFilters = {}): Promise<Sale[]> => {
    return apiRequest<Sale[]>("/sales", {
      params: filters as Record<string, any>,
    });
  },

  get: async (id: string): Promise<SaleOut> => {
    return apiRequest<SaleOut>(`/sales/${id}`);
  },

  createReturn: async (data: SaleReturnPayload): Promise<SaleReturn> => {
    return apiRequest<SaleReturn>("/sales/returns", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
