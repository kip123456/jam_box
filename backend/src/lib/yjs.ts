import * as Y from "yjs";
import prisma from "./prisma";

/** 内存中活跃的 Yjs 文档 Map：key = roomId */
const yjsDocs = new Map<string, Y.Doc>();

/** 待持久化的 debounce 定时器 Map：key = roomId */
const saveTimers = new Map<string, NodeJS.Timeout>();

/**
 * 从 SQLite 加载某个房间的 Yjs 文档；没有持久化记录则返回 null。
 */
export async function loadYjsDocFromDB(roomId: string): Promise<Y.Doc | null> {
  const saved = await prisma.yjsDoc.findUnique({ where: { id: roomId } });
  if (!saved) return null;

  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(saved.ydoc));
  return doc;
}

/**
 * 把一个 Yjs 文档从内存中移除（用于房间没人时释放）。
 */
export function removeYjsDoc(roomId: string): void {
  yjsDocs.delete(roomId);
  const timer = saveTimers.get(roomId);
  if (timer) clearTimeout(timer);
  saveTimers.delete(roomId);
}

/**
 * 获取内存中的 Yjs 文档；没有则返回 undefined。
 */
export function getYjsDoc(roomId: string): Y.Doc | undefined {
  return yjsDocs.get(roomId);
}

/**
 * 注册一个活跃的 Yjs 文档到内存 Map（y-socket.io 初始化时调用）。
 */
export function registerYjsDoc(roomId: string, doc: Y.Doc): void {
  yjsDocs.set(roomId, doc);
}

/**
 * 立即持久化 Yjs 文档到 SQLite。
 * 每次更新都写，确保服务重启时数据不丢失。
 */
export function scheduleSave(roomId: string, doc: Y.Doc): void {
  // 如果已有待保存的定时器，先清除（避免重复写）
  const existing = saveTimers.get(roomId);
  if (existing) clearTimeout(existing);

  // 立即执行保存（不延迟）
  const timer = setTimeout(async () => {
    try {
      const update = Y.encodeStateAsUpdate(doc);
      await prisma.yjsDoc.upsert({
        where: { id: roomId },
        update: { ydoc: Buffer.from(update) },
        create: { id: roomId, ydoc: Buffer.from(update) },
      });
      saveTimers.delete(roomId);
      console.log(`[yjs] persisted doc for room ${roomId} (${update.length} bytes)`);
    } catch (err) {
      console.error(`[yjs] failed to persist doc for room ${roomId}`, err);
    }
  }, 0);

  saveTimers.set(roomId, timer);
}

/**
 * 进程退出前强制保存所有待保存的文档。
 * 在 index.ts 的 process.on('SIGTERM') 中调用。
 */
export async function flushAllPendingSaves(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [roomId, timer] of saveTimers) {
    clearTimeout(timer);
    const doc = yjsDocs.get(roomId);
    if (doc) {
      promises.push(
        (async () => {
          try {
            const update = Y.encodeStateAsUpdate(doc);
            await prisma.yjsDoc.upsert({
              where: { id: roomId },
              update: { ydoc: Buffer.from(update) },
              create: { id: roomId, ydoc: Buffer.from(update) },
            });
            console.log(`[yjs] flushed pending save for room ${roomId} (${update.length} bytes)`);
          } catch (err) {
            console.error(`[yjs] failed to flush save for room ${roomId}`, err);
          }
        })()
      );
    }
  }
  saveTimers.clear();
  await Promise.all(promises);
}

/** REST Track/Note 数据（序列化后的结构） */
export interface RestNote {
  id: string;
  trackId: string;
  pitch: number;
  startTimeTicks: number;
  durationTicks: number;
  velocity: number;
}

export interface RestTrack {
  id: string;
  roomId: string;
  name: string;
  instrumentType: string;
  color: string;
  solo: boolean;
  mute: boolean;
  position: number;
  notes: RestNote[];
}

/**
 * 把 REST Track/Note 数据写入 Yjs 文档，用于首次初始化空文档。
 * Yjs 结构：doc.getMap('tracks') -> trackId: Y.Map(...)，notes: Y.Array(Y.Map(...))
 */
export function restToYjsInitialization(doc: Y.Doc, tracks: RestTrack[]): void {
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
 * 从 Yjs 文档读取完整 Track/Note 快照，用于房间结束时回写 SQLite（可选功能）。
 */
export function yjsToRestSnapshot(doc: Y.Doc): RestTrack[] {
  const tracksMap = doc.getMap("tracks");
  const result: RestTrack[] = [];

  tracksMap.forEach((yTrack, trackId) => {
    if (!(yTrack instanceof Y.Map)) return;

    const notesArr = yTrack.get("notes");
    const notes: RestNote[] = [];
    if (notesArr instanceof Y.Array) {
      notesArr.forEach((yNote) => {
        if (!(yNote instanceof Y.Map)) return;
        notes.push({
          id: "", // Yjs 中没有 note id，REST 会重新生成
          trackId,
          pitch: (yNote.get("pitch") as number) ?? 60,
          startTimeTicks: (yNote.get("startTimeTicks") as number) ?? 0,
          durationTicks: (yNote.get("durationTicks") as number) ?? 480,
          velocity: (yNote.get("velocity") as number) ?? 100,
        });
      });
    }

    result.push({
      id: trackId,
      roomId: "",
      name: (yTrack.get("name") as string) ?? "",
      instrumentType: (yTrack.get("instrumentType") as string) ?? "piano",
      color: (yTrack.get("color") as string) ?? "#3b82f6",
      solo: (yTrack.get("solo") as boolean) ?? false,
      mute: (yTrack.get("mute") as boolean) ?? false,
      position: (yTrack.get("position") as number) ?? 0,
      notes,
    });
  });

  return result;
}
