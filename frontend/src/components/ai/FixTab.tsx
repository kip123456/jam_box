import { useState } from "react";
import { Check, CircleCheck, Loader2, SearchCheck, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiStore } from "@/store/ai";
import { useRoomEditorStore } from "@/store/roomEditor";

/** 修错标签页：检查乐谱（纯规则）→ 问题列表 → 一键修复 → 预览 → 接受/丢弃 */
export default function FixTab() {
  const {
    checkLoading,
    checkError,
    checkResult,
    fixLoading,
    fixError,
    fixResult,
    activePreview,
    runCheck,
    startFix,
    acceptPreview,
    discardPreview,
  } = useAiStore();
  const hasTracks = useRoomEditorStore((state) => state.tracks.length > 0);

  const [accepting, setAccepting] = useState(false);
  const hasPreview = activePreview === "fix" && fixResult !== null;
  const busy = checkLoading || fixLoading || accepting;

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await acceptPreview();
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pt-1">
      <Button variant="outline" className="w-full" onClick={runCheck} disabled={busy || !hasTracks}>
        {checkLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> 检查中…
          </>
        ) : (
          <>
            <SearchCheck className="h-4 w-4" /> 检查乐谱
          </>
        )}
      </Button>
      {!hasTracks && (
        <p className="text-center text-xs text-muted-foreground">当前房间还没有轨道</p>
      )}

      {checkError && <p className="text-xs text-destructive">{checkError}</p>}

      {checkResult && checkResult.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-green-600">
          <CircleCheck className="h-4 w-4" /> 未发现问题，乐谱看起来很健康
        </p>
      )}

      {checkResult && checkResult.length > 0 && (
        <>
          <p className="text-xs font-medium">发现 {checkResult.length} 个问题：</p>
          <ul className="space-y-2">
            {checkResult.map((issue, index) => (
              <li key={index} className="space-y-0.5 rounded-md border p-2 text-xs">
                <p className="font-medium">
                  轨道：{issue.trackName}
                  {issue.noteIndex !== undefined && ` · 音符 ${issue.noteIndex + 1}`}
                </p>
                <p>问题：{issue.message}</p>
                <p className="text-muted-foreground">建议：{issue.suggestion}</p>
              </li>
            ))}
          </ul>
          {!hasPreview && (
            <Button className="w-full" onClick={startFix} disabled={busy}>
              {fixLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> 正在修复…
                </>
              ) : (
                <>
                  <Wrench className="h-4 w-4" /> 一键修复
                </>
              )}
            </Button>
          )}
        </>
      )}

      {fixError && <p className="text-xs text-destructive">{fixError}</p>}

      {hasPreview && (
        <div className="space-y-2 rounded-md border p-2">
          <p className="text-xs font-medium">修复完成，已在左侧半透明预览修复结果。</p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleAccept} disabled={accepting}>
              {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              接受
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={discardPreview}
              disabled={accepting}
            >
              <Trash2 className="h-4 w-4" /> 丢弃
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
