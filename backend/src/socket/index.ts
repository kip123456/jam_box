import { Server, type Socket } from "socket.io";
import * as Y from "yjs";
import { YSocketIO, type Document } from "y-socket.io/dist/server";
import { verifyToken } from "../lib/auth";
import prisma from "../lib/prisma";
import { config } from "../utils/env";
import { scheduleSave, registerYjsDoc, removeYjsDoc, loadYjsDocFromDB } from "../lib/yjs";

/** Socket.IO 握手后注入的用户信息 */
export interface CollabSocketAuth {
  userId: string;
  username: string;
  roomId: string;
}

/** socket.data 上的类型 */
declare module "socket.io" {
  interface Socket {
    authData?: CollabSocketAuth;
  }
}

/**
 * Socket.IO 事件定义（type-safe 事件名）
 */
export const COLLAB_EVENTS = {
  /** 客户端连入 /collab namespace 后立即收到的当前成员列表 */
  MEMBERS_LIST: "members:list",
  /** 新成员加入广播 */
  MEMBER_ONLINE: "member:online",
  /** 成员离线广播 */
  MEMBER_OFFLINE: "member:offline",
  /** 房间锁定 */
  ROOM_LOCKED: "room:locked",
  /** 房间结束 */
  ROOM_ENDED: "room:ended",
} as const;

/**
 * WebRTC 信令事件名（必须和前端 `frontend/src/lib/webrtc.ts` 一致）
 */
export const WEBRTC_EVENTS = {
  /** offer / answer / ICE candidate 转发 */
  SIGNAL: "webrtc:signal",
  /** 客户端加入语音通道 */
  JOIN: "webrtc:join",
  /** 通知房间内其他人：有新成员加入语音通道 */
  JOINED: "webrtc:joined",
  /** 客户端离开语音通道 */
  LEAVE: "webrtc:leave",
  /** 通知房间内其他人：有成员离开语音通道 */
  LEFT: "webrtc:left",
  /** 客户端请求当前语音通道成员列表 */
  VOICE_LIST: "webrtc:voice-list",
  /** 服务端返回当前语音通道成员列表 */
  VOICE_MEMBERS: "webrtc:voice-members",
  /** 成员静音 / 取消静音广播 */
  MUTED: "member:muted",
  UNMUTED: "member:unmuted",
} as const;

/**
 * 成员列表条目（发给前端的完整信息）
 */
export interface OnlineMember {
  userId: string;
  username: string;
}

/** 语音通道成员（服务端记录静音状态） */
export interface VoiceMember {
  userId: string;
  username: string;
  muted: boolean;
}

/** 语音通道成员（带 socketId，供 WebRTC 点对点信令寻址） */
export interface VoiceMemberEvent extends VoiceMember {
  socketId: string;
}

/** 客户端发来的信令消息体 */
export interface WebrtcSignalPayload {
  to: string;
  signal:
    | { type: "offer" | "answer"; sdp: string }
    | { type: "ice"; candidate: RTCIceCandidateInit };
}

/**
 * 已连接房间的成员 Map：roomId -> Map<socketId, OnlineMember>
 * 维护两份 Map 以便 socket disconnect 时快速清理
 */
const connectedMembers = new Map<string, Map<string, OnlineMember>>();
/** 反向索引：socketId -> roomId */
const socketToRoom = new Map<string, string>();
/** 语音通道成员：roomId -> Map<socketId, VoiceMember> */
const voiceMembers = new Map<string, Map<string, VoiceMember>>();

/**
 * 初始化 Socket.IO server，挂载：
 *   1. `/collab` namespace —— 成员在线状态、房间事件、JWT 鉴权
 *   2. `/yjs|roomId` 动态 namespace —— y-socket.io 自动管理 Yjs CRDT 同步
 *      （namespace 正则：/^\/yjs\|.*$/）
 *
 * @param io      Express 创建的 Socket.IO Server 实例
 */
export function setupSocketIO(io: Server): void {
  // ---------- 1. y-socket.io：处理 /yjs|roomId 的 Yjs 同步 ----------
  const ysocketio = new YSocketIO(io, {
    authenticate: async (handshake) => {
      try {
        const auth = await parseHandshakeAuth(handshake);
        if (!auth) return false;
        // 校验是房间成员
        const member = await prisma.roomMember.findUnique({
          where: { roomId_userId: { roomId: auth.roomId, userId: auth.userId } },
        });
        if (!member) {
          console.log(`[socket.io] yjs auth rejected: user ${auth.userId} not member of ${auth.roomId}`);
          return false;
        }
        console.log(`[socket.io] yjs auth ok: user ${auth.userId} -> ${auth.roomId}`);
        return true;
      } catch (err) {
        console.error("[socket.io] yjs authenticate error", err);
        return false;
      }
    },
  });

  ysocketio.initialize();

  // y-socket.io 事件回调 —— 接 SQLite 持久化
  ysocketio.on("document-loaded", async (doc: Document) => {
    // doc.name 是 y-socket.io 的文档名，格式为 "/yjs|roomId"
    const roomId = doc.name.replace(/^\/yjs\|/, "");
    console.log(`[yjs] document-loaded: doc.name=${doc.name}, extracted roomId=${roomId}`);
    // 先尝试从 SQLite 恢复持久化的 Yjs 文档
    const savedDoc = await loadYjsDocFromDB(roomId);
    if (savedDoc) {
      // 把恢复的数据应用到当前文档
      const update = Y.encodeStateAsUpdate(savedDoc);
      Y.applyUpdate(doc, update);
      console.log(`[yjs] document restored from SQLite: ${roomId} (${update.length} bytes)`);
    } else {
      console.log(`[yjs] no saved doc in SQLite, creating new: ${roomId}`);
    }
    registerYjsDoc(roomId, doc);
  });

  ysocketio.on("document-update", (doc: Document) => {
    const roomId = doc.name.replace(/^\/yjs\|/, "");
    scheduleSave(roomId, doc);
  });

  ysocketio.on("all-document-connections-closed", async (doc: Document) => {
    const roomId = doc.name.replace(/^\/yjs\|/, "");
    // 最后一个客户端断开时，先持久化，然后从内存移除
    scheduleSave(roomId, doc);
    removeYjsDoc(roomId);
    console.log(`[yjs] all connections closed for ${roomId}, removed from memory`);
    // 让 y-socket.io 自己 destroy 文档
    await doc.destroy();
  });

  // ---------- 2. /collab namespace：成员在线状态等自定义事件 ----------
  const collabNs = io.of("/collab");

  // 先做鉴权（connection 之前的 middleware）
  collabNs.use(async (socket, next) => {
    try {
      const auth = await parseHandshakeAuth(socket.handshake);
      if (!auth) {
        const err = new Error("鉴权失败") as Error & { data?: any };
        err.data = { code: "auth_required" };
        next(err);
        return;
      }

      // 校验是房间成员
      const member = await prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId: auth.roomId, userId: auth.userId } },
        include: { user: true },
      });
      if (!member) {
        const err = new Error("不是该房间成员") as Error & { data?: any };
        err.data = { code: "not_member" };
        next(err);
        return;
      }

      socket.authData = {
        userId: auth.userId,
        username: member.user.username,
        roomId: auth.roomId,
      };
      next();
    } catch (err) {
      console.error("[socket.io] /collab auth error", err);
      const e = new Error("服务器内部错误") as Error & { data?: any };
      e.data = { code: "internal" };
      next(e);
    }
  });

  collabNs.on("connection", (socket: Socket) => {
    const auth = socket.authData;
    if (!auth) {
      socket.disconnect(true);
      return;
    }

    const { roomId, userId, username } = auth;
    const socketId = socket.id;

    console.log(`[socket.io] /collab connected: ${username}(${userId}) -> ${roomId}`);

    // 加入 Socket.IO room
    socket.join(`room:${roomId}`);

    // 维护成员 Map
    if (!connectedMembers.has(roomId)) {
      connectedMembers.set(roomId, new Map());
    }
    connectedMembers.get(roomId)!.set(socketId, { userId, username });
    socketToRoom.set(socketId, roomId);

    // 立即推送当前所有在线成员列表
    const allOnline: OnlineMember[] = Array.from(connectedMembers.get(roomId)!.values());
    socket.emit(COLLAB_EVENTS.MEMBERS_LIST, allOnline);

    // 通知其他成员有人上线
    socket.to(`room:${roomId}`).emit(COLLAB_EVENTS.MEMBER_ONLINE, { userId, username });

    // ---------- WebRTC 信令（复用 /collab namespace 与房间鉴权） ----------
    const emitVoiceMembers = () => {
      const voice = voiceMembers.get(roomId);
      const members: VoiceMemberEvent[] = voice
        ? Array.from(voice.entries()).map(([id, member]) => ({ socketId: id, ...member }))
        : [];
      socket.emit(WEBRTC_EVENTS.VOICE_MEMBERS, members);
    };

    // 加入语音通道：登记成员并通知房间内其他人
    socket.on(WEBRTC_EVENTS.JOIN, () => {
      if (!voiceMembers.has(roomId)) {
        voiceMembers.set(roomId, new Map());
      }
      const voice = voiceMembers.get(roomId)!;
      if (!voice.has(socketId)) {
        voice.set(socketId, { userId, username, muted: false });
        socket.broadcast.to(`room:${roomId}`).emit(WEBRTC_EVENTS.JOINED, {
          socketId,
          userId,
          username,
          muted: false,
        });
      }
      // 把当前语音成员（含自己）回给加入者，前端会过滤掉自己
      emitVoiceMembers();
    });

    // 查询当前语音成员（未加入语音的成员也能看到麦克风状态）
    socket.on(WEBRTC_EVENTS.VOICE_LIST, emitVoiceMembers);

    // 离开语音通道
    socket.on(WEBRTC_EVENTS.LEAVE, () => {
      const voice = voiceMembers.get(roomId);
      if (!voice || !voice.has(socketId)) return;
      voice.delete(socketId);
      socket.broadcast.to(`room:${roomId}`).emit(WEBRTC_EVENTS.LEFT, { socketId, userId });
      if (voice.size === 0) voiceMembers.delete(roomId);
    });

    // offer/answer/ICE 转发：只允许发给同一房间内的已连接成员
    socket.on(WEBRTC_EVENTS.SIGNAL, (payload: unknown) => {
      if (!isValidWebrtcSignal(payload)) return;
      if (payload.to === socketId) return;
      if (socketToRoom.get(payload.to) !== roomId) return;

      socket.to(payload.to).emit(WEBRTC_EVENTS.SIGNAL, {
        to: payload.to,
        from: socketId,
        fromUserId: userId,
        fromUsername: username,
        signal: payload.signal,
      });
    });

    // 静音状态广播（服务端同时记录，供后加入者查询）
    socket.on(WEBRTC_EVENTS.MUTED, () => {
      const member = voiceMembers.get(roomId)?.get(socketId);
      if (!member) return;
      member.muted = true;
      socket.broadcast
        .to(`room:${roomId}`)
        .emit(WEBRTC_EVENTS.MUTED, { socketId, userId });
    });

    socket.on(WEBRTC_EVENTS.UNMUTED, () => {
      const member = voiceMembers.get(roomId)?.get(socketId);
      if (!member) return;
      member.muted = false;
      socket.broadcast
        .to(`room:${roomId}`)
        .emit(WEBRTC_EVENTS.UNMUTED, { socketId, userId });
    });

    socket.on("disconnect", (reason) => {
      const socketRoom = socketToRoom.get(socketId);
      if (!socketRoom) return;

      const roomMembers = connectedMembers.get(socketRoom);
      if (roomMembers) {
        const leaving = roomMembers.get(socketId);
        roomMembers.delete(socketId);
        socketToRoom.delete(socketId);

        if (leaving) {
          console.log(`[socket.io] /collab disconnected: ${leaving.username}(${leaving.userId}) from ${socketRoom} (${reason})`);

          // 断线时若还在语音通道，自动清理并通知其他人关闭 PeerConnection
          const voice = voiceMembers.get(socketRoom);
          if (voice?.has(socketId)) {
            voice.delete(socketId);
            collabNs.to(`room:${socketRoom}`).emit(WEBRTC_EVENTS.LEFT, {
              socketId,
              userId: leaving.userId,
            });
            if (voice.size === 0) voiceMembers.delete(socketRoom);
          }

          // 通知其他成员有人离线
          collabNs.to(`room:${socketRoom}`).emit(COLLAB_EVENTS.MEMBER_OFFLINE, { userId: leaving.userId });
        }

        // 如果房间没人了，清理 Map
        if (roomMembers.size === 0) {
          connectedMembers.delete(socketRoom);
        }
      }
    });
  });

  console.log("[socket.io] initialized: /collab + /yjs|* namespaces");
}

/**
 * 从 Socket.IO handshake.auth 解析出 JWT + roomId。
 * 成功返回 { userId, username(不填), roomId }；失败返回 null。
 */
async function parseHandshakeAuth(handshake: any): Promise<Omit<CollabSocketAuth, "username"> | null> {
  const auth = handshake.auth ?? handshake.query ?? {};
  const token: string | undefined = auth.token;
  const roomId: string | undefined = auth.roomId;

  if (!token || !roomId) return null;

  try {
    const payload = verifyToken(token);
    if (payload.type !== "access") return null;
    return { userId: payload.sub, roomId };
  } catch {
    return null;
  }
}

/**
 * （工具函数）让其他模块（如 REST 路由）向某个房间广播事件。
 * 例如房间结束/锁定时，REST 路由调用：broadcastRoomEvent("room:ended", roomId, payload)
 */
export function broadcastRoomEvent(io: Server, roomId: string, event: string, payload: unknown): void {
  io.of("/collab").to(`room:${roomId}`).emit(event, payload);
}

/**
 * （工具函数）获取某个房间当前在线成员列表（供 REST 路由等非 Socket.IO 上下文使用）。
 */
export function getOnlineMembers(roomId: string): OnlineMember[] {
  const map = connectedMembers.get(roomId);
  if (!map) return [];
  return Array.from(map.values());
}

/**
 * 校验客户端信令结构，防止畸形数据被转发到房间内其他成员。
 */
function isValidWebrtcSignal(payload: unknown): payload is WebrtcSignalPayload {
  if (!payload || typeof payload !== "object") return false;
  const data = payload as Record<string, unknown>;
  if (typeof data.to !== "string" || data.to.length === 0) return false;

  const signal = data.signal as Record<string, unknown> | undefined;
  if (!signal || typeof signal !== "object") return false;

  if (signal.type === "offer" || signal.type === "answer") {
    return typeof signal.sdp === "string" && signal.sdp.length > 0;
  }
  if (signal.type === "ice") {
    return typeof signal.candidate === "object" && signal.candidate !== null;
  }
  return false;
}

/**
 * （工具函数）获取某个房间当前语音通道成员列表（供测试或非 Socket.IO 上下文使用）。
 */
export function getVoiceMembers(roomId: string): VoiceMemberEvent[] {
  const voice = voiceMembers.get(roomId);
  if (!voice) return [];
  return Array.from(voice.entries()).map(([id, member]) => ({ socketId: id, ...member }));
}

// 导出给其他模块使用
export { connectedMembers, socketToRoom, voiceMembers };
