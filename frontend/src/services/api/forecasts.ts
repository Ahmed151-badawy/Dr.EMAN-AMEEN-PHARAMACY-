import { apiRequest } from "./client";
import { DemandForecast, MedicineForecastDetail, ForecastMethod } from "../../types";

export interface ForecastFilters {
  medicine_id?: string;
  needs_reorder?: boolean;
  stockout_within_days?: number;
  limit?: number;
}

export interface GenerateForecastPayload {
  medicine_id?: string;
  method?: ForecastMethod;
  lookback_days?: number;
  lead_time_days?: number;
  horizon_days?: number;
}

export interface GenerateForecastResult {
  forecasts_generated: number;
  notifications_created: number;
  notifications_resolved: number;
}

export const forecastsApi = {
  list: async (filters: ForecastFilters = {}): Promise<DemandForecast[]> => {
    return apiRequest<DemandForecast[]>("/forecasts", {
      params: filters as Record<string, any>,
    });
  },

  get: async (medicineId: string, lookbackDays: number = 30): Promise<MedicineForecastDetail> => {
    return apiRequest<MedicineForecastDetail>(`/forecasts/${medicineId}`, {
      params: { lookback_days: lookbackDays },
    });
  },

  generate: async (params: GenerateForecastPayload = {}): Promise<GenerateForecastResult> => {
    return apiRequest<GenerateForecastResult>("/forecasts/generate", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },
};
