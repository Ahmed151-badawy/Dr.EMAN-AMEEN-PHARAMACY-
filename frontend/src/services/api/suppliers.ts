import { apiRequest } from "./client";
import { Supplier } from "../../types";

export interface SupplierFilters {
  q?: string;
  active_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface SupplierCreatePayload {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  contact_person?: string | null;
  is_active?: boolean;
}

export interface SupplierUpdatePayload {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  contact_person?: string | null;
  is_active?: boolean;
}

export const suppliersApi = {
  list: async (filters: SupplierFilters = {}): Promise<Supplier[]> => {
    return apiRequest<Supplier[]>("/suppliers", {
      params: filters as Record<string, any>,
    });
  },

  get: async (id: string): Promise<Supplier> => {
    return apiRequest<Supplier>(`/suppliers/${id}`);
  },

  create: async (data: SupplierCreatePayload): Promise<Supplier> => {
    return apiRequest<Supplier>("/suppliers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: SupplierUpdatePayload): Promise<Supplier> => {
    return apiRequest<Supplier>(`/suppliers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
};
