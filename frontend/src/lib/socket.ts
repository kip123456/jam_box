import { io as createSocketIO, type Socket } from "socket.io-client";
import { useUserStore } from "@/store/user";

/**
 * Socket.IO 服务端基础 URL（和 VITE_API_BASE_URL 同源，不带 /api/v1）
 * 例如：http://localhost:3000
 */
export function getSocketBaseUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";
  return apiBase.replace(/\/api\/v1\/?$/, "");
}

/** /collab namespace 的单例 socket 连接 Map：key = roomId */
const collabSockets = new Map<string, Socket>();

/** Socket.IO 连接选项：base URL + 自动重连配置 */
const RECONNECT_CONFIG = {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,
};

/**
 * 获取/创建 /collab namespace 的 Socket.IO 连接。
 * 以 roomId 为 key，确保一个房间只有一个 /collab socket。
 */
export function getCollabSocket(roomId: string): Socket {
  const existing = collabSockets.get(roomId);
  if (existing) return existing;

  const token = useUserStore.getState().token;
  const baseUrl = getSocketBaseUrl();

  const socket = createSocketIO(`${baseUrl}/collab`, {
    transports: ["websocket"],
    auth: { token, roomId },
    ...RECONNECT_CONFIG,
  });

  socket.on("connect_error", (err) => {
    console.error(`[socket.io] /collab connect_error for room ${roomId}:`, err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log(`[socket.io] /collab disconnected from room ${roomId}: ${reason}`);
  });

  collabSockets.set(roomId, socket);
  return socket;
}

/** 断开并清理某个房间的 /collab socket */
export function disconnectCollabSocket(roomId: string): void {
  const socket = collabSockets.get(roomId);
  if (socket) {
    socket.disconnect();
    collabSockets.delete(roomId);
  }
}

/** 断开所有 /collab socket（登出时调用） */
export function disconnectAllCollabSockets(): void {
  for (const [, socket] of collabSockets) {
    socket.disconnect();
  }
  collabSockets.clear();
}
