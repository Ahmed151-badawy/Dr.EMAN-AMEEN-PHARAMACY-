import { apiRequest } from "./client";

export interface HealthStatus {
  status: string;
  app: string;
  env: string;
}

export const healthApi = {
  get: async (): Promise<HealthStatus> => {
    return apiRequest<HealthStatus>("/health");
  },
};
