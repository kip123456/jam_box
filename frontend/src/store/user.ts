import { create } from "zustand";
import client, { type AuthTokens } from "@/api/client";

export interface User {
  id: string;
  username: string;
  email?: string;
}

interface UserState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  /** 用 refresh token 换发新令牌；成功后更新 store 并返回新 access token */
  refresh: () => Promise<string | null>;
  /** 清除登录态并跳转登录页 */
  logout: () => void;
  clear: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  setToken: (token) => set({ token }),
  setUser: (user) => set({ user }),
  refresh: async () => {
    const refreshToken = get().refreshToken;
    if (!refreshToken) return null;

    try {
      const data = (await client.post("/auth/refresh", { refreshToken }, {
        _isRefreshRequest: true,
      } as AuthRequestConfig)) as unknown as AuthTokens;

      set({ token: data.accessToken, refreshToken: data.refreshToken });
      return data.accessToken;
    } catch {
      return null;
    }
  },
  logout: () => {
    set({ token: null, refreshToken: null, user: null });
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  },
  clear: () => set({ token: null, refreshToken: null, user: null }),
}));

type AuthRequestConfig = {
  _isRefreshRequest: boolean;
  headers?: Record<string, string>;
};
