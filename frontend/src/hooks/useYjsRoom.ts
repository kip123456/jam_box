import { useEffect, useRef, useCallback } from "react";
import * as Y from "yjs";
import { SocketIOProvider } from "y-socket.io";
import { getCollabSocket, disconnectCollabSocket, getSocketBaseUrl } from "@/lib/socket";
import { useCollabStore, type OnlineMember } from "@/store/collab";
import { useUserStore } from "@/store/user";
import { useRoomEditorStore } from "@/store/roomEditor";
import type { Note, Track } from "@/api/editor";

/**
 * Socket.IO /collab namespace 的事件名（必须和后端 socket/index.ts 一致）
 */
const EVENT = {
  MEMBERS_LIST: "members:list",
  MEMBER_ONLINE: "member:online",
  MEMBER_OFFLINE: "member:offline",
} as const;

export interface UseYjsRoomResult {
  /** Yjs 文档引用（供组件直接操作） */
  doc: React.MutableRefObject<Y.Doc | null>;
  /** y-socket.io provider 引用 */
  provider: React.MutableRefObject<SocketIOProvider | null>;
  /** 是否已同步完成 */
  synced: boolean;
  /** 协同模式下的编辑操作（写入 Yjs，自动同步到其他客户端） */
  yjsActions: {
    addNote: (trackId: string, note: Omit<Note, "id" | "trackId">) => void;
    updateNote: (trackId: string, noteId: string, updates: Partial<Note>) => void;
    deleteNote: (trackId: string, noteId: string) => void;
  };
}

/**
 * 从 Yjs 文档读取完整 Track/Note 快照
 */
function yjsToTracks(doc: Y.Doc): Track[] {
  const tracksMap = doc.getMap("tracks");
  const result: Track[] = [];

  tracksMap.forEach((yTrack, trackId) => {
    if (!(yTrack instanceof Y.Map)) return;

    const notesArr = yTrack.get("notes");
    const notes: Note[] = [];
    if (notesArr instanceof Y.Array) {
      notesArr.forEach((yNote) => {
        if (!(yNote instanceof Y.Map)) return;
        notes.push({
          id: (yNote.get("id") as string) ?? "",
          trackId,
          pitch: (yNote.get("pitch") as number) ?? 60,
          startTimeTicks: (yNote.get("startTimeTicks") as number) ?? 0,
          durationTicks: (yNote.get("durationTicks") as number) ?? 480,
          velocity: (yNote.get("velocity") as number) ?? 100,
        });
      });
    }

    console.log(`[yjsToTracks] track ${trackId}: ${notes.length} notes, name=${yTrack.get("name")}`);

    result.push({
      id: trackId,
      roomId: "",
      name: (yTrack.get("name") as string) ?? "",
      instrumentType: ((yTrack.get("instrumentType") as string) ?? "piano") as Track["instrumentType"],
      color: (yTrack.get("color") as string) ?? "#3b82f6",
      solo: (yTrack.get("solo") as boolean) ?? false,
      mute: (yTrack.get("mute") as boolean) ?? false,
      position: (yTrack.get("position") as number) ?? 0,
      createdAt: new Date().toISOString(),
      createdById: null,
      notes,
    });
  });

  return result.sort((a, b) => a.position - b.position);
}

/**
 * 把 REST Track/Note 数据写入 Yjs 文档（首次初始化）
 */
function restToYjs(doc: Y.Doc, tracks: Track[]): void {
  const ytracks = doc.getMap("tracks");

  for (const track of tracks) {
    const ytrack = new Y.Map<unknown>();
    ytrack.set("name", track.name);
    ytrack.set("instrumentType", track.instrumentType);
    ytrack.set("color", track.color);
    ytrack.set("solo", track.solo);
    ytrack.set("mute", track.mute);
    ytrack.set("position", track.position);

    const ynotes = new Y.Array<Y.Map<unknown>>();
    for (const note of track.notes) {
      const ynote = new Y.Map<unknown>();
      ynote.set("id", note.id);
      ynote.set("pitch", note.pitch);
      ynote.set("startTimeTicks", note.startTimeTicks);
      ynote.set("durationTicks", note.durationTicks);
      ynote.set("velocity", note.velocity);
      ynotes.push([ynote]);
    }

    ytrack.set("notes", ynotes);
    ytracks.set(track.id, ytrack);
  }
}

/**
 * 在房间内建立 Socket.IO + Yjs 连接，并把 Yjs 绑定到 roomEditor store。
 * - 连接 /collab namespace，监听成员在线/离线事件 → 更新 collab store
 * - 连接 /yjs|roomId namespace（通过 y-socket.io 的 SocketIOProvider）
 * - Yjs 变化 → 解析 → 更新 roomEditor store → React 重渲染
 * - 编辑操作同时写入 Yjs（本地立即生效 + 广播到其他客户端）
 */
export function useYjsRoom(roomId: string | null): UseYjsRoomResult {
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<SocketIOProvider | null>(null);
  const syncedRef = useRef(false);
  const setOnlineMembers = useCollabStore((s) => s.setOnlineMembers);
  const addOnlineMember = useCollabStore((s) => s.addOnlineMember);
  const removeOnlineMember = useCollabStore((s) => s.removeOnlineMember);
  const setConnectionStatus = useCollabStore((s) => s.setConnectionStatus);
  const setYjsSynced = useCollabStore((s) => s.setYjsSynced);
  const resetCollab = useCollabStore((s) => s.reset);
  const token = useUserStore((s) => s.token);

  // 从 Zustand 获取 REST tracks 用于初始化（不直接读 tracks，避免被 Yjs 覆盖）
  const getRestTracks = useCallback(() => useRoomEditorStore.getState().restTracks, []);

  useEffect(() => {
    console.log(`[useYjsRoom] effect triggered, roomId=${roomId}, token=${token ? "exists" : "missing"}`);
    if (!roomId || !token) {
      console.warn(`[useYjsRoom] missing roomId or token, skipping connection`);
      return;
    }

    // ---------- 1. 创建 Yjs 文档 ----------
    const doc = new Y.Doc();
    docRef.current = doc;
    syncedRef.current = false;
    console.log(`[useYjsRoom] connecting to /yjs|${roomId}...`);

    // ---------- 2. 连接 y-socket.io provider（/yjs|roomId namespace） ----------
    const baseUrl = getSocketBaseUrl();
    const yjsProvider = new SocketIOProvider(baseUrl, roomId, doc, {
      autoConnect: true,
      auth: { token, roomId },
    });
    providerRef.current = yjsProvider;

    yjsProvider.on("status", ({ status }: { status: string }) => {
      console.log(`[yjs] /yjs|${roomId} status: ${status}`);
      if (status === "connected") {
        setConnectionStatus("connected");
      } else if (status === "disconnected") {
        setConnectionStatus("disconnected");
      } else if (status === "connecting") {
        setConnectionStatus("connecting");
      }
    });

    yjsProvider.on("sync", (isSynced: boolean) => {
      console.log(`[yjs] /yjs|${roomId} synced: ${isSynced}`);
      setYjsSynced(isSynced);
      syncedRef.current = isSynced;

      // 首次同步完成后，如果 Yjs 为空且 REST 有数据，写入初始数据
      // 注意：延迟检查，给后端恢复的 Yjs 数据留时间同步到前端
      if (isSynced) {
        setTimeout(() => {
          const ytracks = doc.getMap("tracks");
          if (ytracks.size === 0) {
            const restTracks = getRestTracks();
            if (restTracks.length > 0) {
              console.log(`[yjs] initializing doc with ${restTracks.length} tracks from REST`);
              restToYjs(doc, restTracks);
            }
          } else {
            // Yjs 有数据（从 SQLite 恢复），触发一次更新同步到 store
            console.log(`[yjs] doc restored from server, ${ytracks.size} tracks`);
            const tracks = yjsToTracks(doc);
            const currentRoom = useRoomEditorStore.getState().room;
            const currentSelectedTrackId = useRoomEditorStore.getState().selectedTrackId;
            useRoomEditorStore.setState({
              tracks,
              room: currentRoom,
              selectedTrackId: currentSelectedTrackId ?? tracks[0]?.id ?? null,
            });
          }
        }, 100);
      }
    });

    // 延迟检查：给 Yjs 同步留时间，如果 500ms 后还是空的才用 REST 初始化
    setTimeout(() => {
      const ytracks = doc.getMap("tracks");
      if (ytracks.size === 0 && syncedRef.current) {
        const restTracks = getRestTracks();
        if (restTracks.length > 0) {
          console.log(`[yjs] after delay, still empty, initializing with ${restTracks.length} tracks from REST`);
          restToYjs(doc, restTracks);
        }
      }
    }, 500);

    yjsProvider.on("connection-error", () => {
      console.error(`[yjs] /yjs|${roomId} connection error (auth failed?)`);
      setConnectionStatus("error");
    });

    // ---------- 3. Yjs 变化 → 更新 roomEditor store ----------
    // 用 doc.on("update") 监听所有变化，然后解析 tracks
    const updateHandler = () => {
      const tracks = yjsToTracks(doc);
      // 保留 room 信息，只更新 tracks
      const currentRoom = useRoomEditorStore.getState().room;
      const currentSelectedTrackId = useRoomEditorStore.getState().selectedTrackId;
      useRoomEditorStore.setState({
        tracks,
        room: currentRoom,
        selectedTrackId: currentSelectedTrackId ?? tracks[0]?.id ?? null,
      });
    };

    // 监听 tracks map 的深层变化（Y.Map + Y.Array 都会触发）
    const tracksMap = doc.getMap("tracks");
    tracksMap.observeDeep(updateHandler);

    // ---------- 4. 连接 /collab namespace，监听成员事件 ----------
    const collabSocket = getCollabSocket(roomId);

    collabSocket.on(EVENT.MEMBERS_LIST, (members: OnlineMember[]) => {
      console.log(`[collab] members:list (${members.length})`);
      setOnlineMembers(members);
    });

    collabSocket.on(EVENT.MEMBER_ONLINE, (member: OnlineMember) => {
      console.log(`[collab] member:online ${member.username}`);
      addOnlineMember(member);
    });

    collabSocket.on(EVENT.MEMBER_OFFLINE, (data: { userId: string }) => {
      console.log(`[collab] member:offline ${data.userId}`);
      removeOnlineMember(data.userId);
    });

    // collab socket 连接成功后把状态设为 connected
    if (collabSocket.connected) {
      setConnectionStatus("connected");
    } else {
      const onConnect = () => setConnectionStatus("connected");
      collabSocket.once("connect", onConnect);
    }

    // ---------- 5. 清理：组件卸载时断开所有连接 ----------
    return () => {
      console.log(`[useYjsRoom] cleanup for ${roomId}`);

      tracksMap.unobserveDeep(updateHandler);

      collabSocket.off(EVENT.MEMBERS_LIST);
      collabSocket.off(EVENT.MEMBER_ONLINE);
      collabSocket.off(EVENT.MEMBER_OFFLINE);

      // 断开 /collab socket 连接
      disconnectCollabSocket(roomId);

      yjsProvider.disconnect();

      doc.destroy();
      docRef.current = null;
      providerRef.current = null;

      resetCollab();
    };
  }, [roomId, token, setOnlineMembers, addOnlineMember, removeOnlineMember, setConnectionStatus, setYjsSynced, resetCollab, getRestTracks]);

  // ---------- 协同编辑操作（写入 Yjs） ----------
  const yjsActions = {
    addNote: (trackId: string, note: Omit<Note, "id" | "trackId">) => {
      const doc = docRef.current;
      if (!doc || !syncedRef.current) return;

      const ytracks = doc.getMap("tracks");
      const ytrack = ytracks.get(trackId);
      if (!(ytrack instanceof Y.Map)) return;

      const ynotes = ytrack.get("notes");
      if (!(ynotes instanceof Y.Array)) return;

      const noteId = crypto.randomUUID();
      const ynote = new Y.Map<unknown>();
      ynote.set("id", noteId);
      ynote.set("pitch", note.pitch);
      ynote.set("startTimeTicks", note.startTimeTicks);
      ynote.set("durationTicks", note.durationTicks);
      ynote.set("velocity", note.velocity);
      ynotes.push([ynote]);
    },

    updateNote: (trackId: string, noteId: string, updates: Partial<Note>) => {
      const doc = docRef.current;
      if (!doc || !syncedRef.current) return;

      const ytracks = doc.getMap("tracks");
      const ytrack = ytracks.get(trackId);
      if (!(ytrack instanceof Y.Map)) return;

      const ynotes = ytrack.get("notes");
      if (!(ynotes instanceof Y.Array)) return;

      for (let i = 0; i < ynotes.length; i++) {
        const ynote = ynotes.get(i);
        if (ynote instanceof Y.Map && ynote.get("id") === noteId) {
          if (updates.pitch !== undefined) ynote.set("pitch", updates.pitch);
          if (updates.startTimeTicks !== undefined) ynote.set("startTimeTicks", updates.startTimeTicks);
          if (updates.durationTicks !== undefined) ynote.set("durationTicks", updates.durationTicks);
          if (updates.velocity !== undefined) ynote.set("velocity", updates.velocity);
          break;
        }
      }
    },

    deleteNote: (trackId: string, noteId: string) => {
      const doc = docRef.current;
      if (!doc || !syncedRef.current) return;

      const ytracks = doc.getMap("tracks");
      const ytrack = ytracks.get(trackId);
      if (!(ytrack instanceof Y.Map)) return;

      const ynotes = ytrack.get("notes");
      if (!(ynotes instanceof Y.Array)) return;

      for (let i = 0; i < ynotes.length; i++) {
        const ynote = ynotes.get(i);
        if (ynote instanceof Y.Map && ynote.get("id") === noteId) {
          ynotes.delete(i, 1);
          break;
        }
      }
    },
  };

  return { doc: docRef, provider: providerRef, synced: syncedRef.current, yjsActions };
}

/**
 * 当用户离开房间（比如登出）时主动断开所有 socket。
 */
export function cleanupAllCollabConnections(): void {
  disconnectCollabSocket("__all__");
}
