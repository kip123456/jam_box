import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useUserStore } from "@/store/user";

/** 路由守卫：无 token 时跳转登录页（Phase 1 接入真实鉴权后启用） */
export function AuthGuard({ children }: { children: ReactNode }) {
  const token = useUserStore((state) => state.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
