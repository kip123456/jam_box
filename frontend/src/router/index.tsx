import { Navigate, Route, Routes } from "react-router-dom";
import { useUserStore } from "@/store/user";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Rooms from "@/pages/Rooms";
import RoomDetail from "@/pages/RoomDetail";
import HistoryRoomsPage from "@/pages/HistoryRoomsPage";
import NotFound from "@/pages/NotFound";

/** 根路径按登录状态重定向 */
function RootRedirect() {
  const token = useUserStore((state) => state.token);
  return <Navigate to={token ? "/rooms" : "/login"} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/rooms" element={<Rooms />} />
      <Route path="/rooms/:roomId" element={<RoomDetail />} />
      <Route path="/history" element={<HistoryRoomsPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
