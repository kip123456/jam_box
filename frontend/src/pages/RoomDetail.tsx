import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, Mic, MicOff, Share2, Sparkles, Users } from "lucide-react";
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
import { useUserStore } from "@/store/user";
import { useYjsRoom } from "@/hooks/useYjsRoom";
import { MicrophoneError, WebRTCManager, type VoiceState } from "@/lib/webrtc";
import {
  buildExportFileUrl,
  buildShareUrl,
  createShareLink,
  getExportJob,
  submitExport,
} from "@/api/export";
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
  const bpm = useRoomEditorStore((state) => state.bpm);

  // 已结束房间进入只读回放模式：不建立协同/语音连接
  const isEnded = room?.status === "ended";
  const readOnly = Boolean(isEnded);

  // 协同状态
  const onlineMembers = useCollabStore((s) => s.onlineMembers);
  const connectionStatus = useCollabStore((s) => s.connectionStatus);
  const yjsSynced = useCollabStore((s) => s.yjsSynced);

  // 接入协同 hook（Socket.IO + Yjs）；已结束房间不连接
  const { yjsActions } = useYjsRoom(isEnded ? null : roomId ?? null);

  const [actionError, setActionError] = useState("");
  const [exportStatus, setExportStatus] = useState<"idle" | "running" | "error">("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const aiPanelRef = usePanelRef();
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  // 语音通话状态
  const token = useUserStore((s) => s.token);
  const currentUser = useUserStore((s) => s.user);
  const [voiceState, setVoiceState] = useState<VoiceState>({
    joined: false,
    muted: false,
    peers: [],
  });
  const [toast, setToast] = useState<string | null>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  }

  // 创建/销毁 WebRTC 管理器（复用 /collab Socket.IO 连接）
  useEffect(() => {
    if (!roomId || !token || isEnded) return;

    const manager = new WebRTCManager(roomId, setVoiceState);
    webrtcRef.current = manager;

    return () => {
      webrtcRef.current = null;
      void manager.destroy();
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [roomId, token, isEnded]);

  async function handleVoiceButton() {
    const manager = webrtcRef.current;
    if (!manager) return;

    if (voiceState.joined) {
      await manager.leave();
      return;
    }

    try {
      await manager.join();
    } catch (err) {
      showToast(
        err instanceof MicrophoneError ? err.message : "无法打开麦克风，请稍后重试"
      );
    }
  }

  function handleToggleMute() {
    webrtcRef.current?.toggleMute();
  }

  /** 导出 MP3：提交任务 → 每 2 秒轮询直到完成，浏览器下载 */
  async function handleExport() {
    if (!room) return;
    setExportStatus("running");
    setExportMessage("正在导出音频，请稍候...");
    try {
      const { jobId } = await submitExport(room.id, { format: "mp3", bpm });
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const job = await getExportJob(room.id, jobId);
        if (job.status === "completed" && job.result) {
          window.open(buildExportFileUrl(job.result.url), "_blank");
          setExportStatus("idle");
          setExportMessage(`导出完成（${job.result.format.toUpperCase()}）`);
          return;
        }
        if (job.status === "failed") {
          throw new Error(job.error ?? "导出失败");
        }
      }
      throw new Error("导出超时，请稍后重试");
    } catch (err) {
      setExportStatus("error");
      setExportMessage(err instanceof Error ? err.message : "导出失败");
    }
  }

  async function handleShare() {
    if (!room) return;
    setShareBusy(true);
    setActionError("");
    try {
      const { shareUrl: path } = await createShareLink(room.id);
      setShareUrl(buildShareUrl(path));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "生成分享链接失败");
    } finally {
      setShareBusy(false);
    }
  }

  async function handleCopyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("分享链接已复制");
    } catch {
      window.prompt("复制分享链接", shareUrl);
    }
  }

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
    if (isEnded) return;

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
  }, [undo, redo, isEnded]);

  const isPrivateNonMember = room && !room.isPublic && !room.isMember && !isEnded;

  const statusDotColor =
    connectionStatus === "connected"
      ? "bg-green-500"
      : connectionStatus === "connecting"
        ? "bg-yellow-500 animate-pulse"
        : connectionStatus === "error"
          ? "bg-red-500"
          : "bg-gray-400";

  const voicePeerByUserId = new Map(
    voiceState.peers.map((peer) => [peer.userId, peer])
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link className="text-sm underline underline-offset-4" to={isEnded ? "/history" : "/rooms"}>
              ← {isEnded ? "我的合奏" : "返回房间列表"}
            </Link>
            <h1 className="mt-2 text-2xl font-bold">
              {room ? room.name : "房间详情"}
              {room && (
                <span className="ml-2 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {room.roomNumber}
                </span>
              )}
              {isEnded && (
                <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  已结束
                </span>
              )}
            </h1>
            {isEnded ? (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>只读回放</span>
                {room?.endedAt && (
                  <span>· 结束于 {new Date(room.endedAt).toLocaleString("zh-CN")}</span>
                )}
              </div>
            ) : (
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
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!isEnded && (
              <>
                <button
                  onClick={() => setShowMembers((v) => !v)}
                  className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-muted"
                  title="在线成员"
                >
                  <Users className="h-3 w-3" />
                  <span>{onlineMembers.length} 人在线</span>
                </button>
                <Button
                  variant={voiceState.joined ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => void handleVoiceButton()}
                >
                  {voiceState.joined ? (
                    <>
                      <MicOff className="h-4 w-4" />
                      关闭麦克风
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      打开麦克风
                    </>
                  )}
                </Button>
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
              </>
            )}
            {isEnded && room?.isMember && (
              <>
                <Button
                  size="sm"
                  onClick={() => void handleExport()}
                  disabled={exportStatus === "running"}
                >
                  <Download className="h-4 w-4" />
                  {exportStatus === "running" ? "导出中..." : "导出音频"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleShare()}
                  disabled={shareBusy}
                >
                  <Share2 className="h-4 w-4" />
                  分享
                </Button>
              </>
            )}
            {isEnded && (
              <p className="text-xs text-muted-foreground">空格键播放/暂停</p>
            )}
          </div>
        </div>

        {shareUrl && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
            <span className="text-xs text-muted-foreground">分享链接</span>
            <input
              readOnly
              value={shareUrl}
              aria-label="分享链接"
              className="min-w-[240px] flex-1 rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button size="sm" variant="outline" onClick={() => void handleCopyShare()}>
              复制
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShareUrl("")}>
              关闭
            </Button>
          </div>
        )}

        {exportMessage && (
          <p
            className={
              exportStatus === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {exportMessage}
          </p>
        )}
        {/* 在线成员下拉面板（已结束房间不需要） */}
        {!isEnded && showMembers && (
          <div className="rounded-lg border bg-card p-3 shadow-sm">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              在线成员 ({onlineMembers.length})
            </p>
            {onlineMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无在线成员</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {onlineMembers.map((m) => {
                  const isSelf = m.userId === currentUser?.id;
                  const peer = voicePeerByUserId.get(m.userId);
                  const inVoice = isSelf ? voiceState.joined : Boolean(peer);
                  const muted = isSelf ? voiceState.muted : Boolean(peer?.muted);
                  const speaking = Boolean(peer?.speaking);

                  if (!inVoice) {
                    return (
                      <li
                        key={m.userId}
                        className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        {m.username}
                      </li>
                    );
                  }

                  const micIcon = muted ? (
                    <MicOff className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Mic
                      className={`h-3.5 w-3.5 ${
                        speaking ? "text-green-600" : "text-foreground"
                      }`}
                    />
                  );

                  return (
                    <li
                      key={m.userId}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors ${
                        speaking
                          ? "bg-green-500/20 ring-1 ring-green-500"
                          : "bg-muted"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      {m.username}
                      {isSelf ? (
                        <button
                          type="button"
                          onClick={handleToggleMute}
                          title={muted ? "取消静音" : "静音"}
                          className="ml-0.5 rounded p-0.5 hover:bg-background/60"
                        >
                          {micIcon}
                        </button>
                      ) : (
                        micIcon
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {(error || actionError) && (
          <p className="text-sm text-destructive">{error || actionError}</p>
        )}

        {toast && (
          <div
            role="status"
            className="fixed bottom-6 right-6 z-50 max-w-sm rounded-md border border-destructive bg-background px-4 py-2 text-sm text-destructive shadow-lg"
          >
            {toast}
          </div>
        )}

        {loading && !room ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : isPrivateNonMember ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            你不是该房间成员，无法编辑该私有房间。
          </p>
        ) : room ? (
          <>
            <PlayControls readOnly={readOnly} />
            <ResizablePanelGroup
              orientation="horizontal"
              className="h-[calc(100vh-240px)] min-h-[540px]"
            >
              <ResizablePanel defaultSize={readOnly ? "100%" : "74%"} minSize="45%">
                <div className="flex h-full gap-4">
                  <TrackList readOnly={readOnly} />
                  <PianoRoll yjsActions={readOnly ? undefined : yjsActions} readOnly={readOnly} />
                </div>
              </ResizablePanel>
              {!readOnly && (
                <>
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
                </>
              )}
            </ResizablePanelGroup>
          </>
        ) : (
          !error && <p className="text-sm text-muted-foreground">未找到房间。</p>
        )}
      </div>
    </div>
  );
}
