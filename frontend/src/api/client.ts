import axios from "axios";
import { useUserStore } from "@/store/user";

interface ApiEnvelope<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1",
  timeout: 30_000,
});

// 请求拦截器：自动附加 JWT
client.interceptors.request.use((config) => {
  const token = useUserStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：统一解包 + 401 处理
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
  (error) => {
    if (error?.response?.status === 401) {
      useUserStore.getState().clear();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    const message =
      error?.response?.data?.msg || error?.message || "网络请求失败";
    return Promise.reject(new Error(message));
  }
);

export default client;
