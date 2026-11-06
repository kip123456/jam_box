import fs from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import { getYjsDoc, loadYjsDocFromDB, yjsToRestSnapshot, type RestTrack } from "../../lib/yjs";
import { MAX_DURATION_TICKS, TICKS_PER_BEAT, renderTracksToAudio, type RenderableTrack } from "../../lib/renderer";
import { encodeWav } from "../../lib/wav";
import { encodeMp3 } from "../../lib/encoder";

/** backend/storage/exports（开发态 src/queues/handlers 与构建产物 dist/queues/handlers 均得到同一目录） */
const EXPORTS_DIR = path.join(__dirname, "..", "..", "..", "storage", "exports");

interface ExportPayload {
  roomId: string;
  format?: "mp3" | "wav";
  bpm?: number;
  durationTicks?: number;
}

function parsePayload(payload: unknown): ExportPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("导出任务缺少 payload");
  }
  const roomId = (payload as { roomId?: unknown }).roomId;
  if (typeof roomId !== "string" || !roomId) {
    throw new Error("导出任务缺少 roomId");
  }
  return payload as ExportPayload;
}

/** 文件名时间戳：yyyy-mm-dd_HH-mm */
function timestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours()
  )}-${pad(date.getMinutes())}`;
}

/** 优先取 Yjs 最新快照；不可用时回退到 SQLite Track/Note */
async function loadTracks(roomId: string): Promise<RenderableTrack[]> {
  const existing = await prisma.room.findUnique({ where: { id: roomId } });
  if (!existing) {
    throw new Error("房间不存在");
  }

  const doc = getYjsDoc(roomId) ?? (await loadYjsDocFromDB(roomId));

  if (doc) {
    const snapshot = yjsToRestSnapshot(doc);
    if (snapshot.length > 0) {
      return snapshot.map((track: RestTrack) => ({
        instrumentType: track.instrumentType,
        solo: track.solo,
        mute: track.mute,
        notes: track.notes,
      }));
    }
  }

  const tracks = await prisma.track.findMany({
    where: { roomId },
    orderBy: { position: "asc" },
    include: { notes: { orderBy: { startTimeTicks: "asc" } } },
  });

  return tracks.map((track) => ({
    instrumentType: track.instrumentType,
    solo: track.solo,
    mute: track.mute,
    notes: track.notes,
  }));
}

export async function exportHandler(payload: unknown): Promise<Prisma.JsonObject> {
  const { roomId, format: requestedFormat, bpm: requestedBpm, durationTicks: requestedTicks } =
    parsePayload(payload);

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) {
    throw new Error("房间不存在");
  }

  const tracks = await loadTracks(roomId);
  const bpm = requestedBpm ?? room.bpm;

  const lastNoteEnd = tracks.reduce(
    (max, track) =>
      Math.max(
        max,
        ...track.notes.map((note) => note.startTimeTicks + note.durationTicks),
        0
      ),
    0
  );
  const durationTicks = Math.min(
    MAX_DURATION_TICKS,
    Math.max(TICKS_PER_BEAT, requestedTicks ?? Math.max(lastNoteEnd, 4 * TICKS_PER_BEAT))
  );

  const rendered = await renderTracksToAudio(tracks, bpm, durationTicks);
  const wavBuffer = encodeWav(rendered.sampleRate, rendered.left, rendered.right);

  fs.mkdirSync(EXPORTS_DIR, { recursive: true });

  const baseName = `${timestamp(new Date())}-${roomId}`;
  let format: "mp3" | "wav" = "wav";
  let fileName = `${baseName}.wav`;

  if (requestedFormat !== "wav") {
    const mp3Name = `${baseName}.mp3`;
    const encoded = await encodeMp3(wavBuffer, path.join(EXPORTS_DIR, mp3Name));
    if (encoded) {
      format = "mp3";
      fileName = mp3Name;
    }
  }

  if (format === "wav") {
    fs.writeFileSync(path.join(EXPORTS_DIR, fileName), wavBuffer);
  }

  const size = fs.statSync(path.join(EXPORTS_DIR, fileName)).size;

  return {
    fileName,
    format,
    duration: rendered.duration,
    url: `/exports/${fileName}`,
    size,
  };
}
