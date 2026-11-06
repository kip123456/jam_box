import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRoomEditorStore } from "../../frontend/src/store/roomEditor";

vi.mock("@/api/editor", () => ({
  INSTRUMENT_META: {
    piano: { icon: "piano", label: "钢琴" },
    guitar: { icon: "guitar", label: "吉他" },
    bass: { icon: "bass", label: "贝斯" },
    drums: { icon: "drums", label: "鼓" },
  },
  INSTRUMENT_TYPES: ["piano", "guitar", "bass", "drums"],
  getRoomDetail: vi.fn(),
  createTrack: vi.fn(),
  updateTrack: vi.fn(),
  deleteTrack: vi.fn(),
  createNote: vi.fn(),
  bulkCreateNotes: vi.fn(),
  bulkUpdateNotes: vi.fn(),
  bulkDeleteNotes: vi.fn(),
}));

type AnyRecord = Record<string, unknown>;

let api: Record<string, ReturnType<typeof vi.fn>>;

function makeNote(overrides: AnyRecord = {}) {
  return {
    id: "note_1",
    trackId: "track_1",
    pitch: 60,
    startTimeTicks: 0,
    durationTicks: 480,
    velocity: 100,
    ...overrides,
  };
}

function makeTrack(notes: AnyRecord[] = []) {
  return {
    id: "track_1",
    roomId: "room_1",
    name: "钢琴 1",
    instrumentType: "piano",
    color: "#3b82f6",
    solo: false,
    mute: false,
    position: 0,
    createdAt: "2026-11-06T00:00:00.000Z",
    createdById: "user_1",
    notes,
  };
}

const ADD_INPUT = { pitch: 60, startTimeTicks: 0, durationTicks: 480, velocity: 100 };

/**
 * 生产环境中 tracks 由 Yjs 同步写入 store（loadRoom 只保存 restTracks 供 Yjs 初始化）。
 * 单测里没有 Yjs，需要手动模拟 Yjs 初始同步后的 tracks。
 */
function applyRestTracksToStore() {
  const restTracks = useRoomEditorStore.getState().restTracks;
  useRoomEditorStore.setState({
    tracks: restTracks.map((track) => ({
      ...track,
      notes: track.notes.map((note) => ({ ...note })),
    })),
    selectedTrackId: restTracks[0]?.id ?? null,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  api = (await vi.importMock("@/api/editor")) as unknown as Record<
    string,
    ReturnType<typeof vi.fn>
  >;
  useRoomEditorStore.getState().reset();

  api.getRoomDetail.mockResolvedValue({
    id: "room_1",
    roomNumber: "123456",
    tracks: [makeTrack()],
  });
  await useRoomEditorStore.getState().loadRoom("room_1");
  applyRestTracksToStore();
});

describe("roomEditorStore 音符编辑与撤销/重做", () => {
  it("addNote：先写库，再追加音符并清空 future 栈", async () => {
    api.createNote.mockResolvedValue(makeNote());

    await useRoomEditorStore.getState().addNote("track_1", ADD_INPUT);

    const state = useRoomEditorStore.getState();
    expect(api.createNote).toHaveBeenCalledWith("track_1", ADD_INPUT);
    expect(state.tracks[0].notes).toEqual([makeNote()]);
    expect(state.past).toHaveLength(1);
    expect(state.future).toEqual([]);
  });

  it("undo 撤销新增 → 调用 bulkDeleteNotes 删除；redo 重做 → bulkCreateNotes 重建并回填新 id", async () => {
    api.createNote.mockResolvedValue(makeNote());
    await useRoomEditorStore.getState().addNote("track_1", ADD_INPUT);

    api.bulkDeleteNotes.mockResolvedValue({ deleted: 1 });
    await useRoomEditorStore.getState().undo();

    let state = useRoomEditorStore.getState();
    expect(api.bulkDeleteNotes).toHaveBeenCalledWith("track_1", ["note_1"]);
    expect(state.tracks[0].notes).toEqual([]);
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(1);

    api.bulkCreateNotes.mockResolvedValue([makeNote({ id: "note_new" })]);
    await useRoomEditorStore.getState().redo();

    state = useRoomEditorStore.getState();
    expect(api.bulkCreateNotes).toHaveBeenCalledWith("track_1", [ADD_INPUT]);
    expect(state.tracks[0].notes).toHaveLength(1);
    expect(state.tracks[0].notes[0].id).toBe("note_new");
    expect(state.past).toHaveLength(1);
    expect(state.future).toHaveLength(0);
  });

  it("updateNotes：用服务端返回值覆盖本地音符", async () => {
    api.createNote.mockResolvedValue(makeNote());
    await useRoomEditorStore.getState().addNote("track_1", ADD_INPUT);

    api.bulkUpdateNotes.mockResolvedValue([makeNote({ pitch: 72, startTimeTicks: 960 })]);
    await useRoomEditorStore
      .getState()
      .updateNotes("track_1", [{ id: "note_1", pitch: 72, startTimeTicks: 960 }]);

    const state = useRoomEditorStore.getState();
    expect(api.bulkUpdateNotes).toHaveBeenCalledWith("track_1", [
      { id: "note_1", pitch: 72, startTimeTicks: 960 },
    ]);
    expect(state.tracks[0].notes[0]).toMatchObject({ pitch: 72, startTimeTicks: 960 });
    expect(state.past).toHaveLength(2);
  });

  it("deleteNotes 后 undo：按快照重建音符（服务端新 id 回填本地）", async () => {
    api.getRoomDetail.mockResolvedValue({
      id: "room_1",
      roomNumber: "123456",
      tracks: [makeTrack([makeNote()])],
    });
    await useRoomEditorStore.getState().loadRoom("room_1");
    applyRestTracksToStore();

    api.bulkDeleteNotes.mockResolvedValue({ deleted: 1 });
    await useRoomEditorStore.getState().deleteNotes("track_1", ["note_1"]);
    expect(useRoomEditorStore.getState().tracks[0].notes).toEqual([]);

    api.bulkCreateNotes.mockResolvedValue([makeNote({ id: "note_recreated" })]);
    await useRoomEditorStore.getState().undo();

    const state = useRoomEditorStore.getState();
    expect(api.bulkCreateNotes).toHaveBeenCalledWith("track_1", [ADD_INPUT]);
    expect(state.tracks[0].notes).toHaveLength(1);
    expect(state.tracks[0].notes[0].id).toBe("note_recreated");
  });

  it("新的编辑会清空 future（撤销后再编辑无法重做旧分支）", async () => {
    api.createNote.mockResolvedValue(makeNote());
    await useRoomEditorStore.getState().addNote("track_1", ADD_INPUT);
    api.bulkDeleteNotes.mockResolvedValue({ deleted: 1 });
    await useRoomEditorStore.getState().undo();
    expect(useRoomEditorStore.getState().future).toHaveLength(1);

    api.createNote.mockResolvedValue(makeNote({ id: "note_2", pitch: 64 }));
    await useRoomEditorStore
      .getState()
      .addNote("track_1", { pitch: 64, startTimeTicks: 480, durationTicks: 480, velocity: 100 });

    const state = useRoomEditorStore.getState();
    expect(state.future).toEqual([]);
    expect(state.tracks[0].notes[0].id).toBe("note_2");
  });

  it("没有可撤销记录时 undo 不调用任何接口", async () => {
    await useRoomEditorStore.getState().undo();

    expect(api.bulkDeleteNotes).not.toHaveBeenCalled();
    expect(api.bulkCreateNotes).not.toHaveBeenCalled();
    expect(api.bulkUpdateNotes).not.toHaveBeenCalled();
  });

  it("toggleTrackFlag 调 updateTrack 并同步 store", async () => {
    api.updateTrack.mockResolvedValue({ ...makeTrack(), solo: true });

    await useRoomEditorStore.getState().toggleTrackFlag("track_1", "solo");

    expect(api.updateTrack).toHaveBeenCalledWith("track_1", { solo: true });
    expect(useRoomEditorStore.getState().tracks[0].solo).toBe(true);
  });
});
