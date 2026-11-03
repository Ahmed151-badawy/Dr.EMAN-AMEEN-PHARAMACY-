import { apiRequest } from "./client";
import {
  CustomerCreditAccount,
  CustomerCreditAccountUpdatePayload,
  CustomerCreditTransaction,
  CustomerPayment,
  CustomerPaymentCreatePayload,
  CustomerReceivable,
} from "../../types";

export const creditApi = {
  getCustomerCredit: async (customerId: string): Promise<CustomerCreditAccount> => {
    return apiRequest<CustomerCreditAccount>(`/customers/${customerId}/credit`);
  },

  updateCustomerCredit: async (
    customerId: string,
    payload: CustomerCreditAccountUpdatePayload
  ): Promise<CustomerCreditAccount> => {
    return apiRequest<CustomerCreditAccount>(`/customers/${customerId}/credit`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  listCustomerTransactions: async (
    customerId: string,
    params: { limit?: number; offset?: number } = {}
  ): Promise<CustomerCreditTransaction[]> => {
    return apiRequest<CustomerCreditTransaction[]>(
      `/customers/${customerId}/credit/transactions`,
      { params: params as Record<string, any> }
    );
  },

  listCustomerPayments: async (
    customerId: string,
    params: { limit?: number; offset?: number } = {}
  ): Promise<CustomerPayment[]> => {
    return apiRequest<CustomerPayment[]>(
      `/customers/${customerId}/credit/payments`,
      { params: params as Record<string, any> }
    );
  },

  recordCustomerPayment: async (
    customerId: string,
    payload: CustomerPaymentCreatePayload
  ): Promise<CustomerPayment> => {
    return apiRequest<CustomerPayment>(`/customers/${customerId}/credit/payments`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listReceivables: async (
    params: { limit?: number; offset?: number } = {}
  ): Promise<CustomerReceivable[]> => {
    return apiRequest<CustomerReceivable[]>("/customers/credit/receivables", {
      params: params as Record<string, any>,
    });
  },
};
