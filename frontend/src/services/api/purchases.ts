import { apiRequest } from "./client";
import { Purchase, PurchaseStatus } from "../../types";

export interface PurchaseItemRequestPayload {
  medicine_id: string;
  quantity: number;
  unit_price: number;
  batch_number?: string | null;
  expiry_date?: string | null;
}

export interface PurchaseCreatePayload {
  supplier_id?: string | null;
  notes?: string | null;
  items: PurchaseItemRequestPayload[];
}

export interface ReceiveItemPayload {
  purchase_item_id: string;
  expiry_date: string;
  batch_number?: string | null;
}

export interface ReceivePurchasePayload {
  items: ReceiveItemPayload[];
}

export interface PurchaseFilters {
  supplier_id?: string;
  status?: PurchaseStatus;
  limit?: number;
  offset?: number;
}

export const purchasesApi = {
  list: async (filters: PurchaseFilters = {}): Promise<Purchase[]> => {
    return apiRequest<Purchase[]>("/purchases", {
      params: filters as Record<string, any>,
    });
  },

  get: async (id: string): Promise<Purchase> => {
    return apiRequest<Purchase>(`/purchases/${id}`);
  },

  create: async (data: PurchaseCreatePayload): Promise<Purchase> => {
    return apiRequest<Purchase>("/purchases", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  receive: async (id: string, data: ReceivePurchasePayload): Promise<Purchase> => {
    return apiRequest<Purchase>(`/purchases/${id}/receive`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
