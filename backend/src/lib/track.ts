import type { Note, Track } from "@prisma/client";

export type TrackWithNotes = Track & { notes: Note[] };

/** 音符对外序列化：只暴露编辑与播放需要的字段 */
export function serializeNote(note: Note) {
  return {
    id: note.id,
    trackId: note.trackId,
    pitch: note.pitch,
    startTimeTicks: note.startTimeTicks,
    durationTicks: note.durationTicks,
    velocity: note.velocity,
  };
}

/** 轨道对外序列化：包含其音符，时间轴按 startTimeTicks 升序 */
export function serializeTrack(track: TrackWithNotes) {
  return {
    id: track.id,
    roomId: track.roomId,
    name: track.name,
    instrumentType: track.instrumentType,
    color: track.color,
    solo: track.solo,
    mute: track.mute,
    position: track.position,
    createdAt: track.createdAt,
    createdById: track.createdById,
    notes: track.notes.map(serializeNote),
  };
}

/** 查询轨道时统一携带音符，并按时间轴升序 */
export const trackInclude = {
  notes: { orderBy: { startTimeTicks: "asc" } },
} as const;
