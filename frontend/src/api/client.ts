import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useUserStore } from "@/store/user";

interface ApiEnvelope<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

type RetryConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _isRefreshRequest?: boolean;
};

/** 认证类端点自身的 401 不触发静默刷新，避免登录失败被误当成 token 过期 */
const AUTH_ENDPOINTS = ["/auth/login", "/auth/register", "/auth/refresh"];

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1",
  timeout: 30_000,
});

// 请求拦截器：自动附加 JWT（刷新请求本身不带 access token）
client.interceptors.request.use((config) => {
  const typed = config as RetryConfig;
  const token = useUserStore.getState().token;
  if (token && !typed._isRefreshRequest) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

/** 全局 Promise 锁：并发 401 只发一次 refresh */
let refreshPromise: Promise<string | null> | null = null;

function getValidAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = useUserStore
      .getState()
      .refresh()
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// 响应拦截器：统一解包 + 401 静默刷新
client.interceptors.response.use(
  (response) => {
    const body = response.data as ApiEnvelope;

    if (body && typeof body === "object" && "code" in body) {
      if (body.code === 0) {
        return body.data;
      }
      throw new Error(body.msg || "请求失败");
    }

    return response.data;
  },
  async (error: AxiosError<{ msg?: string }>) => {
    const config = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    const url = config?.url ?? "";
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => url.includes(path));

    if (
      status === 401 &&
      config &&
      !config._retry &&
      !config._isRefreshRequest &&
      !isAuthEndpoint
    ) {
      const currentToken = useUserStore.getState().token;
      const requestToken = config.headers.get("Authorization");

      // 若请求发出后 store 已被其他请求刷新过，直接用新 token 重试，避免重复 refresh
      if (
        currentToken &&
        typeof requestToken === "string" &&
        requestToken !== `Bearer ${currentToken}`
      ) {
        config._retry = true;
        config.headers.set("Authorization", `Bearer ${currentToken}`);
        return client(config);
      }

      config._retry = true;
      const newToken = await getValidAccessToken();

      if (newToken) {
        config.headers.set("Authorization", `Bearer ${newToken}`);
        return client(config);
      }

      useUserStore.getState().logout();
      return Promise.reject(new Error("登录已过期，请重新登录"));
    }

    const message = error.response?.data?.msg || error.message || "网络请求失败";
    return Promise.reject(new Error(message));
  }
);

export default client;
