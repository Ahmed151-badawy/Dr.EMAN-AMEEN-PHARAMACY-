import { apiRequest } from "./client";
import { LowStockItem, ExpiringItem, InventoryMovement } from "../../types";

export type WriteOffReason =
  | "expiry_write_off"
  | "damage_write_off"
  | "manual_adjustment"
  | "stock_take_correction";

export interface WriteOffPayload {
  batch_id: string;
  quantity: number;
  reason: WriteOffReason;
  notes?: string | null;
}

export interface InventoryMovementFilters {
  medicine_id?: string;
  batch_id?: string;
  reason?: string;
  reference_type?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}

export const inventoryApi = {
  getLowStock: async (): Promise<LowStockItem[]> => {
    return apiRequest<LowStockItem[]>("/medicines/low-stock");
  },

  getExpiring: async (withinDays?: number): Promise<ExpiringItem[]> => {
    return apiRequest<ExpiringItem[]>("/medicines/expiring", {
      params: withinDays ? { within_days: withinDays } : undefined,
    });
  },

  getMovements: async (filters: InventoryMovementFilters = {}): Promise<InventoryMovement[]> => {
    return apiRequest<InventoryMovement[]>("/inventory/movements", {
      params: filters as Record<string, any>,
    });
  },

  writeOff: async (data: WriteOffPayload): Promise<void> => {
    return apiRequest<void>("/inventory/write-off", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  previewImport: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest<any>("/inventory/import/preview", {
      method: "POST",
      body: formData,
      formData: true,
    });
  },

  commitImport: async (payload: any): Promise<any> => {
    return apiRequest<any>("/inventory/import/commit", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getImportSessions: async (limit: number = 20): Promise<any[]> => {
    return apiRequest<any[]>("/inventory/import/sessions", {
      params: { limit },
    });
  },

  getImportSession: async (sessionId: string): Promise<any> => {
    return apiRequest<any>(`/inventory/import/sessions/${sessionId}`);
  },
};
