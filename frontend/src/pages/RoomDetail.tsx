import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Sparkles, Users } from "lucide-react";
import { PlayControls } from "@/components/PlayControls";
import { TrackList } from "@/components/TrackList";
import { PianoRoll } from "@/components/PianoRoll";
import AISidebar from "@/components/ai/AISidebar";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
} from "@/components/ui/resizable";
import { useRoomEditorStore } from "@/store/roomEditor";
import { useCollabStore } from "@/store/collab";
import { useYjsRoom } from "@/hooks/useYjsRoom";
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

  // 协同状态
  const onlineMembers = useCollabStore((s) => s.onlineMembers);
  const connectionStatus = useCollabStore((s) => s.connectionStatus);
  const yjsSynced = useCollabStore((s) => s.yjsSynced);

  // 接入协同 hook（Socket.IO + Yjs）
  const { yjsActions } = useYjsRoom(roomId ?? null);

  const [actionError, setActionError] = useState("");
  const aiPanelRef = usePanelRef();
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  function toggleAiPanel() {
    const panel = aiPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }

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

  const statusDotColor =
    connectionStatus === "connected"
      ? "bg-green-500"
      : connectionStatus === "connecting"
        ? "bg-yellow-500 animate-pulse"
        : connectionStatus === "error"
          ? "bg-red-500"
          : "bg-gray-400";

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
            {/* 协同状态指示 */}
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${statusDotColor}`} />
              <span>
                {connectionStatus === "connected"
                  ? "已连接"
                  : connectionStatus === "connecting"
                    ? "连接中..."
                    : connectionStatus === "error"
                      ? "连接错误"
                      : "未连接"}
              </span>
              {yjsSynced && connectionStatus === "connected" && (
                <span className="text-green-600">· 实时协同就绪</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMembers((v) => !v)}
              className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-muted"
              title="在线成员"
            >
              <Users className="h-3 w-3" />
              <span>{onlineMembers.length} 人在线</span>
            </button>
            <p className="text-xs text-muted-foreground">
              Ctrl+Z 撤销 · Ctrl+Shift+Z / Ctrl+Y 重做 · 空格播放/暂停 · Delete 删除音符
            </p>
            {room && room.isMember && (
              <Button
                variant={aiCollapsed ? "outline" : "secondary"}
                size="sm"
                onClick={toggleAiPanel}
              >
                <Sparkles className="h-4 w-4" />
                AI 助手
              </Button>
            )}
          </div>
        </div>

        {/* 在线成员下拉面板 */}
        {showMembers && (
          <div className="rounded-lg border bg-card p-3 shadow-sm">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              在线成员 ({onlineMembers.length})
            </p>
            {onlineMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无在线成员</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {onlineMembers.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {m.username}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

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
            <ResizablePanelGroup
              orientation="horizontal"
              className="h-[calc(100vh-240px)] min-h-[540px]"
            >
              <ResizablePanel defaultSize="74%" minSize="45%">
                <div className="flex h-full gap-4">
                  <TrackList />
                  <PianoRoll yjsActions={yjsActions} />
                </div>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel
                collapsible
                collapsedSize="0%"
                defaultSize="26%"
                minSize="300px"
                panelRef={aiPanelRef}
                onResize={(size) => setAiCollapsed(size.asPercentage === 0)}
              >
                <AISidebar onCollapse={() => aiPanelRef.current?.collapse()} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </>
        ) : (
          !error && <p className="text-sm text-muted-foreground">未找到房间。</p>
        )}
      </div>
    </div>
  );
}
