import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INSTRUMENT_META, INSTRUMENT_TYPES, type InstrumentType } from "@/api/editor";
import { useRoomEditorStore } from "@/store/roomEditor";
import { cn } from "@/lib/utils";

export function TrackList() {
  const tracks = useRoomEditorStore((state) => state.tracks);
  const selectedTrackId = useRoomEditorStore((state) => state.selectedTrackId);
  const selectTrack = useRoomEditorStore((state) => state.selectTrack);
  const addTrack = useRoomEditorStore((state) => state.addTrack);
  const renameTrack = useRoomEditorStore((state) => state.renameTrack);
  const toggleTrackFlag = useRoomEditorStore((state) => state.toggleTrackFlag);
  const removeTrack = useRoomEditorStore((state) => state.removeTrack);
  const previewTracks = useRoomEditorStore((state) => state.previewTracks);

  const [instrument, setInstrument] = useState<InstrumentType>("piano");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">轨道</h2>
        <span className="text-xs text-muted-foreground">{tracks.length} 条</span>
      </div>

      <div className="flex flex-col gap-2">
        {tracks.length === 0 && (
          <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            还没有轨道，先在下方添加一个乐器。
          </p>
        )}

        {tracks.map((track) => {
          const selected = track.id === selectedTrackId;
          const meta = INSTRUMENT_META[track.instrumentType];
          return (
            <div
              key={track.id}
              role="button"
              tabIndex={0}
              onClick={() => selectTrack(track.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") selectTrack(track.id);
              }}
              className={cn(
                "rounded-md border p-2 transition-colors",
                selected ? "border-primary bg-accent" : "hover:bg-muted/60",
                track.mute && "opacity-60"
              )}
            >
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-lg">
                  {meta.icon}
                </span>
                <input
                  key={`${track.id}-${track.name}`}
                  defaultValue={track.name}
                  aria-label="轨道名"
                  className={cn(
                    "min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium",
                    "focus:border-input focus:bg-background focus:outline-none"
                  )}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  onBlur={(event) => {
                    const value = event.currentTarget.value;
                    if (value.trim() && value.trim() !== track.name) {
                      void run(() => renameTrack(track.id, value));
                    }
                  }}
                />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: track.color }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label={`删除轨道 ${track.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (window.confirm(`确定删除轨道「${track.name}」？轨道内音符会一并删除。`)) {
                      void run(() => removeTrack(track.id));
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="mt-2 flex items-center gap-4 pl-7">
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Switch
                    checked={track.solo}
                    onCheckedChange={() => void run(() => toggleTrackFlag(track.id, "solo"))}
                    aria-label={`${track.name} solo`}
                  />
                  <span className={track.solo ? "font-semibold text-primary" : undefined}>SOLO</span>
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Switch
                    checked={track.mute}
                    onCheckedChange={() => void run(() => toggleTrackFlag(track.id, "mute"))}
                    aria-label={`${track.name} mute`}
                  />
                  <span className={track.mute ? "font-semibold text-destructive" : undefined}>MUTE</span>
                </label>
              </div>
            </div>
          );
        })}
        {previewTracks?.map((track, index) => {
          const meta = INSTRUMENT_META[track.instrumentType];
          return (
            <div
              key={`preview-${track.id ?? index}`}
              className="pointer-events-none rounded-md border border-dashed border-primary/60 p-2 opacity-50"
            >
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-lg">
                  {meta.icon}
                </span>
                <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">
                  {track.name}
                </span>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: track.color }}
                />
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  预览
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="mt-auto flex flex-col gap-2 border-t pt-3">
        <Select
          value={instrument}
          onValueChange={(value) => setInstrument(value as InstrumentType)}
        >
          <SelectTrigger aria-label="选择乐器">
            <SelectValue placeholder="选择乐器" />
          </SelectTrigger>
          <SelectContent>
            {INSTRUMENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {INSTRUMENT_META[type].icon} {INSTRUMENT_META[type].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={busy} onClick={() => void run(() => addTrack(instrument))}>
          + 添加轨道
        </Button>
      </div>
    </aside>
  );
}
