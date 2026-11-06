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

// 从 localStorage 恢复登录态
function loadPersistedState(): Pick<UserState, "token" | "refreshToken" | "user"> {
  try {
    const token = localStorage.getItem("jam_token");
    const refreshToken = localStorage.getItem("jam_refresh_token");
    const userJson = localStorage.getItem("jam_user");
    const user = userJson ? (JSON.parse(userJson) as User) : null;
    console.log(`[userStore] loaded from localStorage: token=${token ? "exists" : "missing"}, refreshToken=${refreshToken ? "exists" : "missing"}, user=${user ? "exists" : "missing"}`);
    return { token, refreshToken, user };
  } catch (err) {
    console.error(`[userStore] failed to load from localStorage:`, err);
    return { token: null, refreshToken: null, user: null };
  }
}

// 保存登录态到 localStorage
function persistState(token: string | null, refreshToken: string | null, user: User | null): void {
  if (token) {
    localStorage.setItem("jam_token", token);
  } else {
    localStorage.removeItem("jam_token");
  }
  if (refreshToken) {
    localStorage.setItem("jam_refresh_token", refreshToken);
  } else {
    localStorage.removeItem("jam_refresh_token");
  }
  if (user) {
    localStorage.setItem("jam_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("jam_user");
  }
}

export const useUserStore = create<UserState>((set, get) => {
  const persisted = loadPersistedState();

  return {
    token: persisted.token,
    refreshToken: persisted.refreshToken,
    user: persisted.user,
    setToken: (token) => {
      set({ token });
      persistState(token, get().refreshToken, get().user);
    },
    setUser: (user) => {
      set({ user });
      persistState(get().token, get().refreshToken, user);
    },
    refresh: async () => {
      const refreshToken = get().refreshToken;
      if (!refreshToken) {
        console.warn("[auth] no refresh token available");
        return null;
      }

      try {
        console.log("[auth] attempting token refresh...");
        const data = (await client.post("/auth/refresh", { refreshToken }, {
          _isRefreshRequest: true,
        } as AuthRequestConfig)) as unknown as AuthTokens;

        console.log("[auth] token refresh successful");
        set({ token: data.accessToken, refreshToken: data.refreshToken });
        persistState(data.accessToken, data.refreshToken, get().user);
        return data.accessToken;
      } catch (err) {
        console.error("[auth] token refresh failed:", err);
        return null;
      }
    },
    logout: () => {
      set({ token: null, refreshToken: null, user: null });
      persistState(null, null, null);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    },
    clear: () => {
      set({ token: null, refreshToken: null, user: null });
      persistState(null, null, null);
    },
  };
});

type AuthRequestConfig = {
  _isRefreshRequest: boolean;
  headers?: Record<string, string>;
};
