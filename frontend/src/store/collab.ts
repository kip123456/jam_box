import { create } from "zustand";

/** 在线成员（从 Socket.IO /collab namespace 收到） */
export interface OnlineMember {
  userId: string;
  username: string;
}

type CollabConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface CollabState {
  /** 当前房间在线成员列表 */
  onlineMembers: OnlineMember[];
  /** /collab namespace 连接状态 */
  connectionStatus: CollabConnectionStatus;
  /** y-socket.io Yjs provider 同步状态 */
  yjsSynced: boolean;

  setOnlineMembers: (members: OnlineMember[]) => void;
  addOnlineMember: (member: OnlineMember) => void;
  removeOnlineMember: (userId: string) => void;
  setConnectionStatus: (status: CollabConnectionStatus) => void;
  setYjsSynced: (synced: boolean) => void;
  reset: () => void;
}

export const useCollabStore = create<CollabState>((set) => ({
  onlineMembers: [],
  connectionStatus: "disconnected",
  yjsSynced: false,

  setOnlineMembers: (members) => set({ onlineMembers: members }),
  addOnlineMember: (member) =>
    set((state) => {
      if (state.onlineMembers.some((m) => m.userId === member.userId)) return state;
      return { onlineMembers: [...state.onlineMembers, member] };
    }),
  removeOnlineMember: (userId) =>
    set((state) => ({
      onlineMembers: state.onlineMembers.filter((m) => m.userId !== userId),
    })),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setYjsSynced: (synced) => set({ yjsSynced: synced }),
  reset: () =>
    set({
      onlineMembers: [],
      connectionStatus: "disconnected",
      yjsSynced: false,
    }),
}));
