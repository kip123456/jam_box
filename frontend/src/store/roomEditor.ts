import { create } from "zustand";
import * as editorApi from "@/api/editor";
import type {
  InstrumentType,
  Note,
  NoteInput,
  NoteUpdate,
  RoomDetailWithTracks,
  Track,
} from "@/api/editor";

/** 撤销栈最大深度 */
const MAX_HISTORY = 50;
export const DEFAULT_BPM = 120;
export const BPM_MIN = 40;
export const BPM_MAX = 240;
/** MVP 固定 480 ticks = 1/4 拍 */
export const TICKS_PER_BEAT = 480;
/** 钢琴卷帘默认 16 拍（4 小节）画布 */
export const DEFAULT_TOTAL_BEATS = 16;

type Snapshot = Track[];

/** AI 预览内容：与后端 AI 输出结构一致，未入库前只在 PianoRoll/TrackList 半透明展示 */
export interface PreviewNote {
  pitch: number;
  startTimeTicks: number;
  durationTicks: number;
  velocity: number;
}

export interface PreviewTrack {
  id?: string;
  name: string;
  instrumentType: InstrumentType;
  color: string;
  notes: PreviewNote[];
}

function cloneTracks(tracks: Track[]): Track[] {
  return tracks.map((track) => ({ ...track, notes: track.notes.map((note) => ({ ...note })) }));
}

function patchTrackNotes(tracks: Track[], trackId: string, update: (notes: Note[]) => Note[]): Track[] {
  return tracks.map((track) =>
    track.id === trackId ? { ...track, notes: update(track.notes) } : track
  );
}

function notesChanged(a: Note, b: Note): boolean {
  return (
    a.pitch !== b.pitch ||
    a.startTimeTicks !== b.startTimeTicks ||
    a.durationTicks !== b.durationTicks ||
    a.velocity !== b.velocity
  );
}

/**
 * 把后端数据对齐到目标快照：删除多出的音符、重建已消失的音符（拿到新 id）、更新改动的音符。
 * 快照只记录 note 编辑历史，轨道结构变化不进入撤销栈。
 */
async function syncToSnapshot(current: Track[], target: Snapshot): Promise<Snapshot> {
  const next = cloneTracks(target);

  for (const targetTrack of next) {
    const currentTrack = current.find((track) => track.id === targetTrack.id);
    if (!currentTrack) continue;

    const currentNotes = currentTrack.notes;
    const targetNotes = targetTrack.notes;
    const targetIds = new Set(targetNotes.map((note) => note.id));
    const currentIds = new Set(currentNotes.map((note) => note.id));

    const toDelete = currentNotes.filter((note) => !targetIds.has(note.id)).map((note) => note.id);
    const toCreate = targetNotes.filter((note) => !currentIds.has(note.id));
    const toUpdate = targetNotes.filter((note) => {
      const existing = currentNotes.find((currentNote) => currentNote.id === note.id);
      return existing ? notesChanged(existing, note) : false;
    });

    if (toDelete.length > 0) {
      await editorApi.bulkDeleteNotes(targetTrack.id, toDelete);
    }

    if (toCreate.length > 0) {
      const created = await editorApi.bulkCreateNotes(
        targetTrack.id,
        toCreate.map(({ pitch, startTimeTicks, durationTicks, velocity }) => ({
          pitch,
          startTimeTicks,
          durationTicks,
          velocity,
        }))
      );
      // 重建的音符会拿到新 id，按请求顺序回填到快照
      toCreate.forEach((oldNote, index) => {
        const createdNote = created[index];
        const snapshotNote = targetTrack.notes.find((note) => note.id === oldNote.id);
        if (createdNote && snapshotNote) {
          snapshotNote.id = createdNote.id;
          snapshotNote.trackId = createdNote.trackId;
        }
      });
    }

    if (toUpdate.length > 0) {
      const updated = await editorApi.bulkUpdateNotes(
        targetTrack.id,
        toUpdate.map((note) => ({
          id: note.id,
          pitch: note.pitch,
          startTimeTicks: note.startTimeTicks,
          durationTicks: note.durationTicks,
          velocity: note.velocity,
        }))
      );
      // 用后端返回值覆盖快照里的对应音符
      updated.forEach((updatedNote) => {
        const snapshotNote = targetTrack.notes.find((note) => note.id === updatedNote.id);
        if (snapshotNote) Object.assign(snapshotNote, updatedNote);
      });
    }
  }

  return next;
}

interface RoomEditorState {
  roomId: string | null;
  room: RoomDetailWithTracks | null;
  tracks: Track[];
  selectedTrackId: string | null;
  loading: boolean;
  error: string;
  bpm: number;
  loopStartTicks: number;
  loopEndTicks: number;
  playheadTicks: number;
  isPlaying: boolean;
  past: Snapshot[];
  future: Snapshot[];
  /** AI 编曲/修复的预览内容，接受后清空；null 表示无预览 */
  previewTracks: PreviewTrack[] | null;

  loadRoom: (roomId: string) => Promise<void>;
  reset: () => void;
  selectTrack: (trackId: string | null) => void;
  setPreviewTracks: (tracks: PreviewTrack[] | null) => void;
  setBpm: (bpm: number) => void;
  setLoop: (startTicks: number, endTicks: number) => void;
  setPlayhead: (ticks: number) => void;
  setPlaying: (playing: boolean) => void;

  addTrack: (instrumentType: InstrumentType) => Promise<void>;
  renameTrack: (trackId: string, name: string) => Promise<void>;
  toggleTrackFlag: (trackId: string, flag: "solo" | "mute") => Promise<void>;
  removeTrack: (trackId: string) => Promise<void>;

  addNote: (trackId: string, input: NoteInput) => Promise<void>;
  updateNotes: (trackId: string, updates: NoteUpdate[]) => Promise<void>;
  deleteNotes: (trackId: string, noteIds: string[]) => Promise<void>;

  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export const useRoomEditorStore = create<RoomEditorState>((set, get) => ({
  roomId: null,
  room: null,
  tracks: [],
  selectedTrackId: null,
  loading: false,
  error: "",
  bpm: DEFAULT_BPM,
  loopStartTicks: 0,
  loopEndTicks: DEFAULT_TOTAL_BEATS * TICKS_PER_BEAT,
  playheadTicks: 0,
  isPlaying: false,
  past: [],
  future: [],
  previewTracks: null,

  loadRoom: async (roomId) => {
    set({ loading: true, error: "", roomId });
    try {
      const room = await editorApi.getRoomDetail(roomId);
      set({
        room,
        tracks: room.tracks,
        selectedTrackId: room.tracks[0]?.id ?? null,
        loading: false,
        past: [],
        future: [],
        playheadTicks: 0,
        loopStartTicks: 0,
        loopEndTicks: DEFAULT_TOTAL_BEATS * TICKS_PER_BEAT,
        previewTracks: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "加载房间失败",
        room: null,
        tracks: [],
      });
    }
  },

  reset: () =>
    set({
      roomId: null,
      room: null,
      tracks: [],
      selectedTrackId: null,
      loading: false,
      error: "",
      bpm: DEFAULT_BPM,
      loopStartTicks: 0,
      loopEndTicks: DEFAULT_TOTAL_BEATS * TICKS_PER_BEAT,
      playheadTicks: 0,
      isPlaying: false,
      past: [],
      future: [],
      previewTracks: null,
    }),

  selectTrack: (trackId) => set({ selectedTrackId: trackId }),

  setPreviewTracks: (tracks) => set({ previewTracks: tracks }),

  setBpm: (bpm) => {
    if (!Number.isFinite(bpm)) return;
    set({ bpm: Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm))) });
  },

  setLoop: (startTicks, endTicks) => {
    if (!Number.isFinite(startTicks) || !Number.isFinite(endTicks)) return;
    const start = Math.max(0, Math.round(startTicks));
    const end = Math.max(start + TICKS_PER_BEAT, Math.round(endTicks));
    set({ loopStartTicks: start, loopEndTicks: end });
  },

  setPlayhead: (ticks) => set({ playheadTicks: Math.max(0, Math.round(ticks)) }),
  setPlaying: (playing) => set({ isPlaying: playing }),

  addTrack: async (instrumentType) => {
    const { room, tracks } = get();
    if (!room) return;
    const meta = editorApi.INSTRUMENT_META[instrumentType];
    const sameTypeCount = tracks.filter((track) => track.instrumentType === instrumentType).length;
    const track = await editorApi.createTrack(room.id, {
      name: `${meta.label} ${sameTypeCount + 1}`,
      instrumentType,
    });
    set((state) => ({
      tracks: [...state.tracks, track],
      selectedTrackId: track.id,
    }));
  },

  renameTrack: async (trackId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = await editorApi.updateTrack(trackId, { name: trimmed });
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, name: updated.name } : track
      ),
    }));
  },

  toggleTrackFlag: async (trackId, flag) => {
    const track = get().tracks.find((item) => item.id === trackId);
    if (!track) return;
    const updated = await editorApi.updateTrack(trackId, { [flag]: !track[flag] });
    set((state) => ({
      tracks: state.tracks.map((item) =>
        item.id === trackId ? { ...item, [flag]: updated[flag] } : item
      ),
    }));
  },

  removeTrack: async (trackId) => {
    await editorApi.deleteTrack(trackId);
    set((state) => {
      const tracks = state.tracks.filter((track) => track.id !== trackId);
      return {
        tracks,
        selectedTrackId:
          state.selectedTrackId === trackId ? tracks[0]?.id ?? null : state.selectedTrackId,
      };
    });
  },

  addNote: async (trackId, input) => {
    const before = cloneTracks(get().tracks);
    const note = await editorApi.createNote(trackId, input);
    set((state) => ({
      tracks: patchTrackNotes(state.tracks, trackId, (notes) => [...notes, note]),
      past: [...state.past, before].slice(-MAX_HISTORY),
      future: [],
    }));
  },

  updateNotes: async (trackId, updates) => {
    if (updates.length === 0) return;
    const before = cloneTracks(get().tracks);
    const updated = await editorApi.bulkUpdateNotes(trackId, updates);
    set((state) => ({
      tracks: patchTrackNotes(state.tracks, trackId, (notes) =>
        notes.map((note) => {
          const next = updated.find((item) => item.id === note.id);
          return next ? { ...next } : note;
        })
      ),
      past: [...state.past, before].slice(-MAX_HISTORY),
      future: [],
    }));
  },

  deleteNotes: async (trackId, noteIds) => {
    if (noteIds.length === 0) return;
    const before = cloneTracks(get().tracks);
    await editorApi.bulkDeleteNotes(trackId, noteIds);
    set((state) => ({
      tracks: patchTrackNotes(state.tracks, trackId, (notes) =>
        notes.filter((note) => !noteIds.includes(note.id))
      ),
      past: [...state.past, before].slice(-MAX_HISTORY),
      future: [],
    }));
  },

  undo: async () => {
    const { past, future, tracks } = get();
    if (past.length === 0) return;

    const target = past[past.length - 1];
    const nextTracks = await syncToSnapshot(tracks, target);

    set({
      tracks: nextTracks,
      past: past.slice(0, -1),
      future: [cloneTracks(tracks), ...future].slice(0, MAX_HISTORY),
    });
  },

  redo: async () => {
    const { past, future, tracks } = get();
    if (future.length === 0) return;

    const target = future[0];
    const nextTracks = await syncToSnapshot(tracks, target);

    set({
      tracks: nextTracks,
      past: [...past, cloneTracks(tracks)].slice(-MAX_HISTORY),
      future: future.slice(1),
    });
  },
}));
