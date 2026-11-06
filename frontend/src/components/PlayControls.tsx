import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BPM_MAX,
  BPM_MIN,
  DEFAULT_TOTAL_BEATS,
  TICKS_PER_BEAT,
  useRoomEditorStore,
} from "@/store/roomEditor";
import * as audio from "@/lib/audio";

export function PlayControls({ readOnly = false }: { readOnly?: boolean }) {
  const bpm = useRoomEditorStore((state) => state.bpm);
  const loopStartTicks = useRoomEditorStore((state) => state.loopStartTicks);
  const loopEndTicks = useRoomEditorStore((state) => state.loopEndTicks);
  const isPlaying = useRoomEditorStore((state) => state.isPlaying);
  const playheadTicks = useRoomEditorStore((state) => state.playheadTicks);
  const setBpm = useRoomEditorStore((state) => state.setBpm);
  const setLoop = useRoomEditorStore((state) => state.setLoop);
  const setPlayhead = useRoomEditorStore((state) => state.setPlayhead);
  const tracks = useRoomEditorStore((state) => state.tracks);

  const [error, setError] = useState("");
  const isPlayingRef = useRef(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  async function handlePlay() {
    const state = useRoomEditorStore.getState();
    try {
      setError("");
      await audio.play(state.tracks, {
        bpm: state.bpm,
        loopStartTicks: state.loopStartTicks,
        loopEndTicks: state.loopEndTicks,
      });
      state.setPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "播放失败");
    }
  }

  function handlePause() {
    audio.pause();
    useRoomEditorStore.getState().setPlaying(false);
  }

  function handleStop() {
    audio.stop();
    const state = useRoomEditorStore.getState();
    state.setPlaying(false);
    state.setPlayhead(0);
  }

  // 播放头：每 50ms 从 Tone.Transport 读取当前位置
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setPlayhead(audio.getPlayheadTicks()), 50);
    return () => window.clearInterval(timer);
  }, [isPlaying, setPlayhead]);

  // 播放中切换 solo/mute → 重新调度（不重播旧位置之前的音符）
  const soloMuteSignature = tracks
    .map((track) => `${track.id}:${track.solo}:${track.mute}`)
    .join("|");
  const prevSignature = useRef(soloMuteSignature);
  useEffect(() => {
    const changed = prevSignature.current !== soloMuteSignature;
    prevSignature.current = soloMuteSignature;
    if (!changed || !isPlayingRef.current) return;

    const state = useRoomEditorStore.getState();
    void audio
      .play(state.tracks, {
        bpm: state.bpm,
        loopStartTicks: state.loopStartTicks,
        loopEndTicks: state.loopEndTicks,
      })
      .catch((err) => setError(err instanceof Error ? err.message : "重新调度失败"));
  }, [soloMuteSignature]);

  // 空格键播放 / 暂停
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;
      event.preventDefault();
      if (isPlayingRef.current) {
        handlePause();
      } else {
        void handlePlay();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function changeBpm(value: string) {
    const parsed = Number(value);
    if (value === "" || !Number.isFinite(parsed)) return;
    setBpm(parsed);
    if (isPlayingRef.current) {
      audio.setBpm(useRoomEditorStore.getState().bpm);
    }
  }

  function changeLoop(startBeat: number, endBeat: number) {
    setLoop(startBeat * TICKS_PER_BEAT, endBeat * TICKS_PER_BEAT);
    if (isPlayingRef.current) {
      const state = useRoomEditorStore.getState();
      audio.setLoop(state.loopStartTicks, state.loopEndTicks);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-3">
      <div className="flex gap-1">
        <Button
          variant={isPlaying ? "secondary" : "default"}
          onClick={() => void handlePlay()}
          aria-label={readOnly ? "回放" : "播放"}
        >
          <Play className="h-4 w-4" /> {readOnly ? "回放" : "播放"}
        </Button>
        <Button
          variant="outline"
          onClick={handlePause}
          disabled={!isPlaying}
          aria-label="暂停"
        >
          <Pause className="h-4 w-4" /> 暂停
        </Button>
        <Button variant="outline" onClick={handleStop} aria-label="停止">
          <Square className="h-4 w-4" /> 停止
        </Button>
      </div>

      {!readOnly && (
        <>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        BPM（{BPM_MIN}-{BPM_MAX}）
        <input
          type="number"
          min={BPM_MIN}
          max={BPM_MAX}
          step={1}
          value={bpm}
          onChange={(event) => changeBpm(event.target.value)}
          onBlur={(event) => changeBpm(event.currentTarget.value)}
          className="h-8 w-24 rounded-md border border-input bg-transparent px-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        循环起点（拍）
        <input
          type="number"
          min={0}
          max={DEFAULT_TOTAL_BEATS - 1}
          step={1}
          value={loopStartTicks / TICKS_PER_BEAT}
          onChange={(event) =>
            changeLoop(Number(event.target.value), loopEndTicks / TICKS_PER_BEAT)
          }
          className="h-8 w-24 rounded-md border border-input bg-transparent px-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        循环终点（拍）
        <input
          type="number"
          min={1}
          max={DEFAULT_TOTAL_BEATS}
          step={1}
          value={loopEndTicks / TICKS_PER_BEAT}
          onChange={(event) =>
            changeLoop(loopStartTicks / TICKS_PER_BEAT, Number(event.target.value))
          }
          className="h-8 w-24 rounded-md border border-input bg-transparent px-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
        </>
      )}

      <span className="ml-auto font-mono text-xs text-muted-foreground">
        播放头 {Math.round(playheadTicks / TICKS_PER_BEAT)} / {DEFAULT_TOTAL_BEATS} 拍
      </span>

      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
