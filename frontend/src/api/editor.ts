import client from "./client";
import type { RoomDetail } from "./rooms";

export type InstrumentType = "piano" | "guitar" | "bass" | "drums";

/** 乐器图标与默认轨道名 */
export const INSTRUMENT_META: Record<InstrumentType, { icon: string; label: string }> = {
  piano: { icon: "🎹", label: "钢琴" },
  guitar: { icon: "🎸", label: "吉他" },
  bass: { icon: "🎧", label: "贝斯" },
  drums: { icon: "🥁", label: "鼓" },
};

export const INSTRUMENT_TYPES = Object.keys(INSTRUMENT_META) as InstrumentType[];

export interface Note {
  id: string;
  trackId: string;
  pitch: number;
  startTimeTicks: number;
  durationTicks: number;
  velocity: number;
}

export interface Track {
  id: string;
  roomId: string;
  name: string;
  instrumentType: InstrumentType;
  color: string;
  solo: boolean;
  mute: boolean;
  position: number;
  createdAt: string;
  createdById: string | null;
  notes: Note[];
}

export interface RoomDetailWithTracks extends RoomDetail {
  tracks: Track[];
}

export interface NoteInput {
  pitch: number;
  startTimeTicks: number;
  durationTicks: number;
  velocity?: number;
}

export interface NoteUpdate {
  id: string;
  pitch?: number;
  startTimeTicks?: number;
  durationTicks?: number;
  velocity?: number;
}

/** GET /rooms/:roomId：房间信息 + 全部轨道及其音符（一次加载） */
export async function getRoomDetail(roomId: string): Promise<RoomDetailWithTracks> {
  return (await client.get(`/rooms/${roomId}`)) as unknown as RoomDetailWithTracks;
}

/** POST /rooms/:roomId/tracks */
export async function createTrack(
  roomId: string,
  input: { name: string; instrumentType: InstrumentType; color?: string }
): Promise<Track> {
  return (await client.post(
    `/rooms/${roomId}/tracks`,
    input
  )) as unknown as Track;
}

/** PUT /tracks/:trackId */
export async function updateTrack(
  trackId: string,
  patch: Partial<Pick<Track, "name" | "solo" | "mute" | "color" | "position">>
): Promise<Track> {
  return (await client.put(`/tracks/${trackId}`, patch)) as unknown as Track;
}

/** DELETE /tracks/:trackId */
export async function deleteTrack(trackId: string): Promise<void> {
  await client.delete(`/tracks/${trackId}`);
}

/** POST /tracks/:trackId/notes */
export async function createNote(trackId: string, input: NoteInput): Promise<Note> {
  return (await client.post(`/tracks/${trackId}/notes`, input)) as unknown as Note;
}

/** POST /tracks/:trackId/notes/bulk */
export async function bulkCreateNotes(trackId: string, notes: NoteInput[]): Promise<Note[]> {
  return (await client.post(`/tracks/${trackId}/notes/bulk`, notes)) as unknown as Note[];
}

/** PUT /tracks/:trackId/notes/bulk */
export async function bulkUpdateNotes(trackId: string, notes: NoteUpdate[]): Promise<Note[]> {
  return (await client.put(`/tracks/${trackId}/notes/bulk`, notes)) as unknown as Note[];
}

/** DELETE /tracks/:trackId/notes/bulk */
export async function bulkDeleteNotes(trackId: string, noteIds: string[]): Promise<{ deleted: number }> {
  return (await client.delete(`/tracks/${trackId}/notes/bulk`, {
    data: { noteIds },
  })) as unknown as { deleted: number };
}
