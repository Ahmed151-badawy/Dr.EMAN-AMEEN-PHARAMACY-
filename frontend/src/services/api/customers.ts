import { apiRequest } from "./client";
import { Customer, CustomerStats, Sale } from "../../types";

export interface CustomerFilters {
  q?: string;
  limit?: number;
  offset?: number;
}

export interface CustomerCreatePayload {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
}

export interface CustomerUpdatePayload {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
}

export const customersApi = {
  list: async (filters: CustomerFilters = {}): Promise<Customer[]> => {
    return apiRequest<Customer[]>("/customers", {
      params: filters as Record<string, any>,
    });
  },

  get: async (id: string): Promise<Customer> => {
    return apiRequest<Customer>(`/customers/${id}`);
  },

  create: async (data: CustomerCreatePayload): Promise<Customer> => {
    return apiRequest<Customer>("/customers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: CustomerUpdatePayload): Promise<Customer> => {
    return apiRequest<Customer>(`/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  getStats: async (id: string): Promise<CustomerStats> => {
    return apiRequest<CustomerStats>(`/customers/${id}/stats`);
  },

  getSales: async (id: string): Promise<Sale[]> => {
    return apiRequest<Sale[]>(`/customers/${id}/sales`);
  },
};
