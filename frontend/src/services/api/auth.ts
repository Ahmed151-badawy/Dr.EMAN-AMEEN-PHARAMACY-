import { apiRequest } from "./client";
import { AuthToken, User } from "../../types";

export const authApi = {
  login: async (username: string, password: string): Promise<AuthToken> => {
    const formData = new FormData();
    formData.append("username", username);
    formData.append("password", password);

    return apiRequest<AuthToken>("/auth/login", {
      method: "POST",
      body: formData,
      formData: true,
    });
  },

  getMe: async (): Promise<User> => {
    return apiRequest<User>("/auth/me");
  },
};
