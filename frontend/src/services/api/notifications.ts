import { apiRequest } from "./client";
import { Notification, NotificationType, NotificationSeverity } from "../../types";

export interface NotificationFilters {
  unread?: boolean;
  resolved?: boolean;
  type?: NotificationType;
  severity?: NotificationSeverity;
  limit?: number;
}

export const notificationsApi = {
  list: async (filters: NotificationFilters = {}): Promise<Notification[]> => {
    return apiRequest<Notification[]>("/notifications", {
      params: filters as Record<string, any>,
    });
  },

  markRead: async (id: string): Promise<Notification> => {
    return apiRequest<Notification>(`/notifications/${id}/read`, {
      method: "PATCH",
    });
  },

  markAllRead: async (): Promise<{ marked_read: number }> => {
    return apiRequest<{ marked_read: number }>("/notifications/read-all", {
      method: "PATCH",
    });
  },

  runChecks: async (): Promise<{ created: number; resolved: number }> => {
    return apiRequest<{ created: number; resolved: number }>("/notifications/run-checks", {
      method: "POST",
    });
  },
};
