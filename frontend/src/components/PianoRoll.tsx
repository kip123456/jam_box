import { useEffect, useRef, useState } from "react";
import type { Note } from "@/api/editor";
import {
  DEFAULT_TOTAL_BEATS,
  TICKS_PER_BEAT,
  useRoomEditorStore,
} from "@/store/roomEditor";
import { useCollabStore } from "@/store/collab";
import { cn } from "@/lib/utils";

/** 可见 MIDI 音高范围：A0 ~ C8（88 键） */
const PITCH_MIN = 21;
const PITCH_MAX = 108;
/** 每个半音行高（px） */
const CELL_HEIGHT = 8;
/** 每 tick 像素宽度；480 ticks（1/4 拍）= 38.4px */
const PX_PER_TICK = 0.08;

const TOTAL_TICKS = DEFAULT_TOTAL_BEATS * TICKS_PER_BEAT;
const BEAT_WIDTH = TICKS_PER_BEAT * PX_PER_TICK;
const GRID_WIDTH = TOTAL_TICKS * PX_PER_TICK;
const GRID_HEIGHT = (PITCH_MAX - PITCH_MIN + 1) * CELL_HEIGHT;
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteName(pitch: number): string {
  return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  origPitch: number;
  origTicks: number;
  pitch: number;
  ticks: number;
  moved: boolean;
}

interface YjsActions {
  addNote: (trackId: string, note: Omit<Note, "id" | "trackId">) => void;
  updateNote: (trackId: string, noteId: string, updates: Partial<Note>) => void;
  deleteNote: (trackId: string, noteId: string) => void;
}

interface PianoRollProps {
  yjsActions?: YjsActions;
  /** 只读回放：禁止添加/拖动/删除音符 */
  readOnly?: boolean;
}

export function PianoRoll({ yjsActions, readOnly = false }: PianoRollProps) {
  const tracks = useRoomEditorStore((state) => state.tracks);
  const selectedTrackId = useRoomEditorStore((state) => state.selectedTrackId);
  const playheadTicks = useRoomEditorStore((state) => state.playheadTicks);
  const addNote = useRoomEditorStore((state) => state.addNote);
  const updateNotes = useRoomEditorStore((state) => state.updateNotes);
  const deleteNotes = useRoomEditorStore((state) => state.deleteNotes);
  const previewTracks = useRoomEditorStore((state) => state.previewTracks);

  // 协同状态：已同步且已连接时使用 Yjs，否则回退到 REST
  const yjsSynced = useCollabStore((s) => s.yjsSynced);
  const connectionStatus = useCollabStore((s) => s.connectionStatus);
  const useYjs = Boolean(yjsSynced && connectionStatus === "connected" && yjsActions);

  const track = tracks.find((item) => item.id === selectedTrackId) ?? null;
  // AI 预览：修复预览（带轨道 id）只在对应轨道选中时显示；编曲预览（新轨道）始终叠加显示
  const visiblePreview = (previewTracks ?? []).filter((item) =>
    item.id ? item.id === selectedTrackId : true
  );
  const hasPreview = visiblePreview.length > 0;
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [error, setError] = useState("");
  const dragRef = useRef<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragging = drag !== null;

  useEffect(() => {
    setSelectedNoteId(null);
  }, [selectedTrackId]);

  // 初次进入时把视图滚到中央 C（C4）附近
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (PITCH_MAX - 72) * CELL_HEIGHT;
      scrollRef.current.scrollLeft = 0;
    }
  }, []);

  // Delete / Backspace 删除选中音符
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (readOnly) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (!selectedNoteId || !selectedTrackId) return;
      event.preventDefault();
      if (useYjs && yjsActions) {
        yjsActions.deleteNote(selectedTrackId, selectedNoteId);
        setSelectedNoteId(null);
      } else {
        void deleteNotes(selectedTrackId, [selectedNoteId])
          .then(() => setSelectedNoteId(null))
          .catch((err) => setError(err instanceof Error ? err.message : "删除音符失败"));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNoteId, selectedTrackId, deleteNotes, useYjs, yjsActions, readOnly]);

  // 拖拽移动音符（pointermove 更新预览，pointerup 提交 bulk 更新）
  useEffect(() => {
    if (!dragging || !selectedTrackId) return;

    function handleMove(event: PointerEvent) {
      const state = dragRef.current;
      if (!state) return;

      const deltaPitch = Math.round((state.startY - event.clientY) / CELL_HEIGHT);
      const deltaTicks =
        Math.round((event.clientX - state.startX) / PX_PER_TICK / TICKS_PER_BEAT) * TICKS_PER_BEAT;

      const next: DragState = {
        ...state,
        pitch: clamp(state.origPitch + deltaPitch, PITCH_MIN, PITCH_MAX),
        ticks: Math.max(0, state.origTicks + deltaTicks),
        moved:
          state.moved ||
          Math.abs(event.clientX - state.startX) > 2 ||
          Math.abs(event.clientY - state.startY) > 2,
      };
      dragRef.current = next;
      setDrag(next);
    }

    function handleUp() {
      const state = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!state || !state.moved) return;
      if (state.pitch === state.origPitch && state.ticks === state.origTicks) return;

      setError("");
      if (useYjs && yjsActions) {
        yjsActions.updateNote(selectedTrackId!, state.id, {
          pitch: state.pitch,
          startTimeTicks: state.ticks,
        });
      } else {
        void updateNotes(selectedTrackId!, [
          { id: state.id, pitch: state.pitch, startTimeTicks: state.ticks },
        ]).catch((err) => setError(err instanceof Error ? err.message : "移动音符失败"));
      }
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging, selectedTrackId, updateNotes]);

  function beginDrag(event: React.PointerEvent<HTMLDivElement>, note: Note) {
    event.stopPropagation();
    setSelectedNoteId(note.id);
    if (readOnly) return;
    const state: DragState = {
      id: note.id,
      startX: event.clientX,
      startY: event.clientY,
      origPitch: note.pitch,
      origTicks: note.startTimeTicks,
      pitch: note.pitch,
      ticks: note.startTimeTicks,
      moved: false,
    };
    dragRef.current = state;
    setDrag(state);
  }

  function handleAddNote(event: React.PointerEvent<HTMLDivElement>) {
    if (!track || readOnly) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0) return;

    const pitch = clamp(PITCH_MAX - Math.floor(y / CELL_HEIGHT), PITCH_MIN, PITCH_MAX);
    const startTimeTicks =
      Math.round(x / PX_PER_TICK / TICKS_PER_BEAT) * TICKS_PER_BEAT;

    setError("");
    if (useYjs && yjsActions) {
      yjsActions.addNote(track.id, {
        pitch,
        startTimeTicks,
        durationTicks: TICKS_PER_BEAT,
        velocity: 100,
      });
    } else {
      void addNote(track.id, {
        pitch,
        startTimeTicks,
        durationTicks: TICKS_PER_BEAT,
        velocity: 100,
      }).catch((err) => setError(err instanceof Error ? err.message : "添加音符失败"));
    }
  }

  if (!track && !hasPreview) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed bg-card text-sm text-muted-foreground">
        {readOnly ? "该房间没有可回放的轨道。" : "先在左侧添加或选择一条轨道，然后在钢琴卷帘上点击添加音符。"}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {track ? `${track.name} · MIDI 音高 ${PITCH_MIN}-${PITCH_MAX}` : "AI 预览"}
        </span>
        <span className="text-xs text-muted-foreground">
          {readOnly ? "只读回放" : "点击空白添加音符，拖动移动，选中后按 Delete 删除"}
        </span>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div
        ref={scrollRef}
        className="relative overflow-auto rounded-lg border bg-background"
        style={{ height: 460 }}
      >
        <div className="flex min-w-max">
          <div className="sticky left-0 z-30 border-r bg-background" style={{ width: 56 }}>
            <div className="sticky top-0 z-40 border-b bg-background" style={{ height: 24 }} />
            {Array.from({ length: PITCH_MAX - PITCH_MIN + 1 }, (_, index) => {
              const pitch = PITCH_MAX - index;
              const black = BLACK_PITCH_CLASSES.has(pitch % 12);
              return (
                <div
                  key={pitch}
                  className={cn(
                    "flex items-center border-b border-border/40 pr-1",
                    black ? "bg-muted text-muted-foreground" : "bg-background"
                  )}
                  style={{ height: CELL_HEIGHT }}
                >
                  {pitch % 12 === 0 && (
                    <span className="pl-1 text-[8px] leading-none">{noteName(pitch)}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="relative" style={{ width: GRID_WIDTH }}>
            <div
              className="sticky top-0 z-20 flex border-b bg-background"
              style={{ width: GRID_WIDTH, height: 24 }}
            >
              {Array.from({ length: DEFAULT_TOTAL_BEATS }, (_, index) => (
                <div
                  key={index}
                  className="shrink-0 border-l border-border/60 pl-1 text-[10px] leading-6 text-muted-foreground"
                  style={{ width: BEAT_WIDTH }}
                >
                  {index + 1}
                </div>
              ))}
            </div>

            <div
              className={cn(
                "relative",
                readOnly ? "cursor-default" : "cursor-crosshair"
              )}
              style={{ width: GRID_WIDTH, height: GRID_HEIGHT }}
              onPointerDown={handleAddNote}
            >
              {Array.from({ length: PITCH_MAX - PITCH_MIN + 1 }, (_, index) => {
                const pitch = PITCH_MAX - index;
                const black = BLACK_PITCH_CLASSES.has(pitch % 12);
                return (
                  <div
                    key={pitch}
                    className={cn(
                      "absolute left-0 right-0 border-b border-border/30",
                      black ? "bg-muted/50" : "bg-transparent"
                    )}
                    style={{ top: index * CELL_HEIGHT, height: CELL_HEIGHT }}
                  />
                );
              })}

              {Array.from({ length: DEFAULT_TOTAL_BEATS }, (_, index) => (
                <div
                  key={`beat-${index}`}
                  className={cn(
                    "pointer-events-none absolute bottom-0 top-0 border-l",
                    index % 4 === 0 ? "border-border" : "border-border/40"
                  )}
                  style={{ left: index * BEAT_WIDTH }}
                />
              ))}

              {(track?.notes ?? []).map((note) => {
                const active = drag?.id === note.id;
                const pitch = active ? drag!.pitch : note.pitch;
                const ticks = active ? drag!.ticks : note.startTimeTicks;
                return (
                  <div
                    key={note.id}
                    onPointerDown={(event) => beginDrag(event, note)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedNoteId(note.id);
                    }}
                    className={cn(
                      "absolute rounded-sm border border-black/30",
                      readOnly ? "cursor-default" : "cursor-grab",
                      selectedNoteId === note.id && "z-10 ring-2 ring-primary",
                      active && "z-10 cursor-grabbing"
                    )}
                    style={{
                      left: ticks * PX_PER_TICK,
                      top: (PITCH_MAX - pitch) * CELL_HEIGHT,
                      width: Math.max(note.durationTicks * PX_PER_TICK - 1, 4),
                      height: CELL_HEIGHT - 1,
                      backgroundColor: track?.color,
                    }}
                    title={`${noteName(pitch)} · 第 ${(ticks / TICKS_PER_BEAT).toFixed(2)} 拍`}
                  />
                );
              })}

              {visiblePreview.flatMap((previewTrack, trackIndex) =>
                previewTrack.notes.map((note, noteIndex) => {
                  const pitch = clamp(note.pitch, PITCH_MIN, PITCH_MAX);
                  return (
                    <div
                      key={`preview-${trackIndex}-${noteIndex}`}
                      className="pointer-events-none absolute rounded-sm border border-dashed border-black/40 opacity-50"
                      style={{
                        left: note.startTimeTicks * PX_PER_TICK,
                        top: (PITCH_MAX - pitch) * CELL_HEIGHT,
                        width: Math.max(note.durationTicks * PX_PER_TICK - 1, 4),
                        height: CELL_HEIGHT - 1,
                        backgroundColor: previewTrack.color,
                      }}
                      title={`预览 · ${previewTrack.name}`}
                    />
                  );
                })
              )}

              <div
                className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-destructive"
                style={{ left: playheadTicks * PX_PER_TICK }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
