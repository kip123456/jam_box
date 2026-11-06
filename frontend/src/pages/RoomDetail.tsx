import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PlayControls } from "@/components/PlayControls";
import { TrackList } from "@/components/TrackList";
import { PianoRoll } from "@/components/PianoRoll";
import { useRoomEditorStore } from "@/store/roomEditor";
import * as audio from "@/lib/audio";

export default function RoomDetail() {
  const { roomId } = useParams<{ roomId: string }>();
  const room = useRoomEditorStore((state) => state.room);
  const loading = useRoomEditorStore((state) => state.loading);
  const error = useRoomEditorStore((state) => state.error);
  const loadRoom = useRoomEditorStore((state) => state.loadRoom);
  const reset = useRoomEditorStore((state) => state.reset);
  const undo = useRoomEditorStore((state) => state.undo);
  const redo = useRoomEditorStore((state) => state.redo);

  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (roomId) {
      void loadRoom(roomId);
    }
    return () => {
      audio.stop();
      reset();
    };
  }, [roomId, loadRoom, reset]);

  // Ctrl+Z 撤销 / Ctrl+Shift+Z 或 Ctrl+Y 重做
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        void undo().catch((err) =>
          setActionError(err instanceof Error ? err.message : "撤销失败")
        );
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        void redo().catch((err) =>
          setActionError(err instanceof Error ? err.message : "重做失败")
        );
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const isPrivateNonMember = room && !room.isPublic && !room.isMember;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link className="text-sm underline underline-offset-4" to="/rooms">
              ← 返回房间列表
            </Link>
            <h1 className="mt-2 text-2xl font-bold">
              {room ? room.name : "房间详情"}
              {room && (
                <span className="ml-2 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {room.roomNumber}
                </span>
              )}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Ctrl+Z 撤销 · Ctrl+Shift+Z / Ctrl+Y 重做 · 空格播放/暂停 · Delete 删除音符
          </p>
        </div>

        {(error || actionError) && (
          <p className="text-sm text-destructive">{error || actionError}</p>
        )}

        {loading && !room ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : isPrivateNonMember ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            你不是该房间成员，无法编辑该私有房间。
          </p>
        ) : room ? (
          <>
            <PlayControls />
            <div className="flex gap-4">
              <TrackList />
              <PianoRoll />
            </div>
          </>
        ) : (
          !error && <p className="text-sm text-muted-foreground">未找到房间。</p>
        )}
      </div>
    </div>
  );
}
