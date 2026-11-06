import { useState } from "react";
import { Check, Loader2, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INSTRUMENT_META } from "@/api/editor";
import { useAiStore } from "@/store/ai";

/** 编曲标签页：输入文字描述 → 异步生成 → 预览 → 接受/丢弃 */
export default function ComposeTab() {
  const {
    composeLoading,
    composeError,
    composeResult,
    activePreview,
    startCompose,
    acceptPreview,
    discardPreview,
  } = useAiStore();

  const [instruction, setInstruction] = useState("");
  const [accepting, setAccepting] = useState(false);

  const canSubmit = instruction.trim().length > 0 && !composeLoading && !accepting;
  const hasPreview = activePreview === "compose" && composeResult !== null;

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
      <textarea
        className="min-h-20 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
        placeholder="描述你想要的音乐，例如：写一段 4 小节轻快的 C 大调钢琴旋律"
        maxLength={500}
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        disabled={composeLoading}
      />
      <Button className="w-full" disabled={!canSubmit} onClick={() => startCompose(instruction.trim())}>
        {composeLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> 正在生成…
          </>
        ) : (
          <>
            <Wand2 className="h-4 w-4" /> 生成
          </>
        )}
      </Button>

      {composeError && <p className="text-xs text-destructive">{composeError}</p>}

      {composeResult && (
        <div className="space-y-2 rounded-md border p-2">
          <p className="text-xs font-medium">
            生成了 {composeResult.length} 条轨道（已在左侧半透明预览）：
          </p>
          <ul className="space-y-1">
            {composeResult.map((track, index) => {
              const meta = INSTRUMENT_META[track.instrumentType];
              return (
                <li key={index} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: track.color }}
                  />
                  <span>{meta?.icon}</span>
                  <span className="truncate">{track.name}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {track.notes.length} 个音符
                  </span>
                </li>
              );
            })}
          </ul>
          {hasPreview && (
            <div className="flex gap-2 pt-1">
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
          )}
        </div>
      )}
    </div>
  );
}
