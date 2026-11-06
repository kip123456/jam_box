import client from "./client";

export type MemberRole = "owner" | "member";
export type RoomStatus = "active" | "locked" | "ended";

export interface RoomOwner {
  id: string;
  username: string;
}

export interface RoomMemberInfo {
  id: string;
  userId: string;
  username: string | null;
  role: MemberRole;
  joinedAt: string;
}

export interface RoomSummary {
  id: string;
  roomNumber: string;
  name: string;
  isPublic: boolean;
  status: RoomStatus;
  createdAt: string;
  owner: RoomOwner;
  memberCount: number;
}

export interface RoomDetail {
  id: string;
  roomNumber: string;
  name: string;
  isPublic: boolean;
  status: RoomStatus;
  bpm: number;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: RoomOwner | null;
  members: RoomMemberInfo[];
  isMember?: boolean;
  role?: MemberRole | null;
}

/** GET /rooms?status=ended 返回的“我的合奏”条目 */
export interface EndedRoomSummary {
  id: string;
  code: string;
  roomNumber: string;
  name: string;
  bpm: number;
  status: RoomStatus;
  endedAt: string | null;
  isHost: boolean;
  owner: RoomOwner;
  trackCount: number;
  memberCount: number;
}

/** GET /rooms：公开活跃房间列表 */
export async function listRooms(): Promise<RoomSummary[]> {
  return (await client.get("/rooms")) as unknown as Promise<RoomSummary[]>;
}

/** GET /rooms?status=ended：当前用户参与过的已结束房间 */
export async function listEndedRooms(): Promise<EndedRoomSummary[]> {
  const data = (await client.get("/rooms", {
    params: { status: "ended" },
  })) as unknown as { rooms: EndedRoomSummary[] };
  return data.rooms;
}

/** POST /rooms：创建房间 */
export async function createRoom(input: {
  name: string;
  isPublic: boolean;
  password?: string;
}): Promise<RoomDetail> {
  return (await client.post("/rooms", input)) as unknown as Promise<RoomDetail>;
}

/** POST /rooms/:roomNumber/join：按 6 位房间号加入房间 */
export async function joinRoom(roomNumber: string, password?: string): Promise<RoomDetail> {
  return (await client.post(
    `/rooms/${roomNumber}/join`,
    password ? { password } : {}
  )) as unknown as Promise<RoomDetail>;
}
