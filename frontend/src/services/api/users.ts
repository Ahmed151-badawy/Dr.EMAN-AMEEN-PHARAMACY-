import { apiRequest } from "./client";
import { User, UserRole } from "../../types";

export interface UserCreatePayload {
  username: string;
  full_name: string;
  password: string;
  role: UserRole;
}

export interface UserUpdatePayload {
  full_name?: string;
  role?: UserRole;
  is_active?: boolean;
  password?: string;
}

export const usersApi = {
  list: async (): Promise<User[]> => {
    return apiRequest<User[]>("/users");
  },

  create: async (data: UserCreatePayload): Promise<User> => {
    return apiRequest<User>("/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (userId: string, data: UserUpdatePayload): Promise<User> => {
    return apiRequest<User>(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  deactivate: async (userId: string): Promise<void> => {
    return apiRequest<void>(`/users/${userId}`, {
      method: "DELETE",
    });
  },

  delete: async (userId: string, permanent: boolean = true): Promise<void> => {
    return apiRequest<void>(`/users/${userId}`, {
      method: "DELETE",
      params: permanent ? { permanent: true } : undefined,
    });
  },
};

