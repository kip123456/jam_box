import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAiStore } from "@/store/ai";

/** 问答标签页：聊天气泡形式，用户右侧、AI 左侧，回车发送，保留最近 5 轮 */
export default function AskTab() {
  const { askHistory, askLoading, askError, ask } = useAiStore();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [askHistory, askLoading]);

  const send = () => {
    const question = input.trim();
    if (!question || askLoading) return;
    setInput("");
    void ask(question);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-1 pr-1">
        {askHistory.length === 0 && !askLoading && (
          <p className="pt-4 text-center text-xs text-muted-foreground">
            问任何乐理问题，例如：Dmaj7 由哪些音组成？
          </p>
        )}
        {askHistory.map((message, index) => (
          <div
            key={index}
            className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-xs leading-relaxed",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              )}
            >
              {message.content}
            </div>
          </div>
        ))}
        {askLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> 思考中…
            </div>
          </div>
        )}
        {askError && <p className="text-xs text-destructive">{askError}</p>}
        <div ref={bottomRef} />
      </div>
      <div className="flex shrink-0 gap-2 border-t pt-2">
        <input
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="输入乐理问题…"
          maxLength={500}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
        />
        <Button size="icon" className="h-9 w-9 shrink-0" onClick={send} disabled={!input.trim() || askLoading}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
