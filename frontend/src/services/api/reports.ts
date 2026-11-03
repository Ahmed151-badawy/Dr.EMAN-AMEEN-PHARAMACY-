import { apiRequest, getStoredToken } from "./client";
import { ControlledReportResponse, ControlledReportFilters } from "../../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export const reportsApi = {
  /**
   * Fetches paginated controlled medicines audit transactions and summary statistics.
   */
  getControlledMedicinesReport: async (
    filters: ControlledReportFilters = {}
  ): Promise<ControlledReportResponse> => {
    const params = new URLSearchParams();
    if (filters.start_date) params.append("start_date", filters.start_date);
    if (filters.end_date) params.append("end_date", filters.end_date);
    if (filters.medicine_id) params.append("medicine_id", filters.medicine_id);
    if (filters.controlled_schedule) params.append("controlled_schedule", filters.controlled_schedule);
    if (filters.transaction_type && filters.transaction_type !== "all") {
      params.append("transaction_type", filters.transaction_type);
    }
    if (filters.customer_id) params.append("customer_id", filters.customer_id);
    if (filters.user_id) params.append("user_id", filters.user_id);
    if (filters.invoice_ref) params.append("invoice_ref", filters.invoice_ref);
    if (filters.page) params.append("page", String(filters.page));
    if (filters.limit) params.append("limit", String(filters.limit));

    const qs = params.toString();
    return apiRequest<ControlledReportResponse>(`/reports/controlled-medicines${qs ? `?${qs}` : ""}`);
  },

  /**
   * Authenticated export of the controlled medicines audit register to Excel (.xlsx).
   */
  downloadControlledMedicinesExcel: async (filters: ControlledReportFilters = {}): Promise<void> => {
    const token = getStoredToken();
    const params = new URLSearchParams();
    if (filters.start_date) params.append("start_date", filters.start_date);
    if (filters.end_date) params.append("end_date", filters.end_date);
    if (filters.medicine_id) params.append("medicine_id", filters.medicine_id);
    if (filters.controlled_schedule) params.append("controlled_schedule", filters.controlled_schedule);
    if (filters.transaction_type && filters.transaction_type !== "all") {
      params.append("transaction_type", filters.transaction_type);
    }
    if (filters.customer_id) params.append("customer_id", filters.customer_id);
    if (filters.user_id) params.append("user_id", filters.user_id);
    if (filters.invoice_ref) params.append("invoice_ref", filters.invoice_ref);

    const qs = params.toString();
    const baseUrl = API_BASE_URL ? (API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL) : "";
    const url = `${baseUrl}/reports/controlled-medicines/export-excel${qs ? `?${qs}` : ""}`;

    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      let errDetail = "Failed to export report";
      try {
        const errJson = await response.json();
        errDetail = errJson.detail || errDetail;
      } catch {
        // use default
      }
      throw new Error(errDetail);
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `controlled_medicines_audit_${new Date().toISOString().split("T")[0]}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },
};
