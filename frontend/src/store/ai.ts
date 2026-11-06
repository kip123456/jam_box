import { create } from "zustand";
import * as aiApi from "@/api/ai";
import * as editorApi from "@/api/editor";
import { useRoomEditorStore } from "./roomEditor";

/** 任务轮询间隔 */
const POLL_INTERVAL_MS = 2000;
/** 问答最多保留最近 5 轮（10 条消息） */
const MAX_ASK_MESSAGES = 10;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type PreviewKind = "compose" | "fix";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "请求失败，请稍后再试";
}

/** 每 2s 轮询一次任务直到 success/failed */
async function pollJob<T>(
  fetcher: (jobId: string) => Promise<aiApi.AiJob<T>>,
  jobId: string
): Promise<T> {
  for (;;) {
    const job = await fetcher(jobId);
    if (job.status === "success") {
      return (job.result ?? {}) as T;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "任务执行失败");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/** 把当前编辑器轨道转换为 check/fix 接口的入参结构 */
function toCheckTracks(): aiApi.CheckTrackInput[] {
  return useRoomEditorStore.getState().tracks.map((track) => ({
    id: track.id,
    name: track.name,
    instrumentType: track.instrumentType,
    color: track.color,
    notes: track.notes.map((note) => ({
      id: note.id,
      pitch: note.pitch,
      startTimeTicks: note.startTimeTicks,
      durationTicks: note.durationTicks,
      velocity: note.velocity,
    })),
  }));
}

interface AiState {
  /** 当前预览来源：决定 accept/discard 时清哪个结果 */
  activePreview: PreviewKind | null;

  composeLoading: boolean;
  composeError: string;
  composeResult: aiApi.AiTrack[] | null;

  askLoading: boolean;
  askError: string;
  askHistory: ChatMessage[];

  checkLoading: boolean;
  checkError: string;
  checkResult: aiApi.CheckIssue[] | null;

  fixLoading: boolean;
  fixError: string;
  fixResult: aiApi.AiTrack[] | null;

  startCompose: (instruction: string) => Promise<void>;
  clearCompose: () => void;
  ask: (question: string) => Promise<void>;
  runCheck: () => Promise<void>;
  startFix: () => Promise<void>;
  acceptPreview: () => Promise<void>;
  discardPreview: () => void;
  reset: () => void;
}

export const useAiStore = create<AiState>((set, get) => ({
  activePreview: null,

  composeLoading: false,
  composeError: "",
  composeResult: null,

  askLoading: false,
  askError: "",
  askHistory: [],

  checkLoading: false,
  checkError: "",
  checkResult: null,

  fixLoading: false,
  fixError: "",
  fixResult: null,

  startCompose: async (instruction) => {
    const { roomId, bpm } = useRoomEditorStore.getState();
    if (!roomId) return;

    set({ composeLoading: true, composeError: "", composeResult: null });
    try {
      const { jobId } = await aiApi.submitCompose({ instruction, roomId, bpm });
      const result = await pollJob(aiApi.getComposeJob, jobId);
      const tracks = result.tracks ?? [];
      set({ composeResult: tracks, composeLoading: false, activePreview: "compose" });
      useRoomEditorStore.getState().setPreviewTracks(tracks);
    } catch (err) {
      set({ composeError: errorMessage(err), composeLoading: false });
    }
  },

  clearCompose: () => {
    const { activePreview } = get();
    if (activePreview === "compose") {
      useRoomEditorStore.getState().setPreviewTracks(null);
    }
    set({ composeResult: null, composeError: "", activePreview: null });
  },

  ask: async (question) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    set((state) => ({
      askLoading: true,
      askError: "",
      askHistory: [...state.askHistory, { role: "user" as const, content: trimmed }].slice(-MAX_ASK_MESSAGES),
    }));

    try {
      const { answer } = await aiApi.askQuestion(trimmed);
      set((state) => ({
        askLoading: false,
        askHistory: [...state.askHistory, { role: "assistant" as const, content: answer }].slice(-MAX_ASK_MESSAGES),
      }));
    } catch (err) {
      set({ askLoading: false, askError: errorMessage(err) });
    }
  },

  runCheck: async () => {
    set({ checkLoading: true, checkError: "" });
    try {
      const { issues } = await aiApi.checkScore(toCheckTracks());
      set({ checkResult: issues, checkLoading: false });
    } catch (err) {
      set({ checkError: errorMessage(err), checkLoading: false });
    }
  },

  startFix: async () => {
    const { roomId } = useRoomEditorStore.getState();
    const { checkResult } = get();
    if (!roomId || !checkResult || checkResult.length === 0) return;

    set({ fixLoading: true, fixError: "", fixResult: null });
    try {
      const { jobId } = await aiApi.submitFix({
        roomId,
        tracks: toCheckTracks(),
        issues: checkResult,
      });
      const result = await pollJob(aiApi.getFixJob, jobId);
      const tracks = result.tracks ?? [];
      set({ fixResult: tracks, fixLoading: false, activePreview: "fix" });
      useRoomEditorStore.getState().setPreviewTracks(tracks);
    } catch (err) {
      set({ fixError: errorMessage(err), fixLoading: false });
    }
  },

  /** 接受预览：写入 Track/Note API，刷新房间数据并清除预览 */
  acceptPreview: async () => {
    const { activePreview, composeResult, fixResult } = get();
    const editor = useRoomEditorStore.getState();
    const roomId = editor.roomId;
    if (!activePreview || !roomId) return;

    if (activePreview === "compose" && composeResult) {
      for (const track of composeResult) {
        const created = await editorApi.createTrack(roomId, {
          name: track.name,
          instrumentType: track.instrumentType,
          color: track.color,
        });
        if (track.notes.length > 0) {
          await editorApi.bulkCreateNotes(
            created.id,
            track.notes.map(({ pitch, startTimeTicks, durationTicks, velocity }) => ({
              pitch,
              startTimeTicks,
              durationTicks,
              velocity,
            }))
          );
        }
      }
    }

    if (activePreview === "fix" && fixResult) {
      // 修复结果覆盖现有轨道音符：先删后建（AI 可能改动大部分音符，逐个 diff 无收益）
      for (const fixedTrack of fixResult) {
        if (!fixedTrack.id) continue;
        const current = editor.tracks.find((track) => track.id === fixedTrack.id);
        if (!current) continue;
        const existingIds = current.notes.map((note) => note.id);
        if (existingIds.length > 0) {
          await editorApi.bulkDeleteNotes(fixedTrack.id, existingIds);
        }
        if (fixedTrack.notes.length > 0) {
          await editorApi.bulkCreateNotes(
            fixedTrack.id,
            fixedTrack.notes.map(({ pitch, startTimeTicks, durationTicks, velocity }) => ({
              pitch,
              startTimeTicks,
              durationTicks,
              velocity,
            }))
          );
        }
      }
    }

    set({
      composeResult: null,
      fixResult: null,
      checkResult: activePreview === "fix" ? null : get().checkResult,
      activePreview: null,
    });
    useRoomEditorStore.getState().setPreviewTracks(null);
    await useRoomEditorStore.getState().loadRoom(roomId);
  },

  /** 丢弃预览：仅清除预览状态，不写库 */
  discardPreview: () => {
    const { activePreview } = get();
    set({
      composeResult: activePreview === "compose" ? null : get().composeResult,
      fixResult: activePreview === "fix" ? null : get().fixResult,
      activePreview: null,
    });
    useRoomEditorStore.getState().setPreviewTracks(null);
  },

  reset: () => {
    useRoomEditorStore.getState().setPreviewTracks(null);
    set({
      activePreview: null,
      composeLoading: false,
      composeError: "",
      composeResult: null,
      askLoading: false,
      askError: "",
      askHistory: [],
      checkLoading: false,
      checkError: "",
      checkResult: null,
      fixLoading: false,
      fixError: "",
      fixResult: null,
    });
  },
}));
