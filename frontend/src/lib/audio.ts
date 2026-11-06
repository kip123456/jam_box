import * as Tone from "tone";
import type { InstrumentType, Track } from "@/api/editor";

/** MVP 固定 480 ticks = 1/4 拍（与后端一致） */
const TICKS_PER_BEAT = 480;

interface PartEvent {
  time: string;
  pitch: number;
  durationTicks: number;
  velocity: number;
}

export interface PlayOptions {
  bpm: number;
  loopStartTicks: number;
  loopEndTicks: number;
}

let audioStarted = false;
let synths: Tone.PolySynth[] = [];
let parts: Tone.Part<PartEvent>[] = [];

/** 首次调用必须在用户手势回调里（点击播放），否则 AudioContext 无法启动 */
export async function ensureAudio(): Promise<void> {
  if (audioStarted) return;
  await Tone.start();
  audioStarted = true;
  if (import.meta.env.DEV) {
    console.log("[audio] AudioContext 已启动，state =", Tone.getContext().state);
  }
}

/** ticks → 传输时间记谱 "小节:拍:十六分"，让 Transport 的 BPM 变化能自然生效 */
export function ticksToTransportTime(ticks: number): string {
  const beats = Math.max(0, ticks) / TICKS_PER_BEAT;
  const bars = Math.floor(beats / 4);
  const beatInBar = Math.floor(beats % 4);
  const sixteenths = Math.floor((beats - Math.floor(beats)) * 4);
  return `${bars}:${beatInBar}:${sixteenths}`;
}

/** 从 Transport 当前记谱位置换算回 ticks（用于播放头） */
export function getPlayheadTicks(): number {
  const position = Tone.Transport.position;
  if (typeof position !== "string") return 0;
  const [bars = "0", beats = "0", sixteenths = "0"] = position.split(":");
  const totalBeats = Number(bars) * 4 + Number(beats) + Number(sixteenths) / 4;
  return Math.max(0, totalBeats * TICKS_PER_BEAT);
}

/** 按乐器类型创建音色（MVP 用不同 PolySynth 参数区分四种乐器） */
function createSynth(instrumentType: InstrumentType): Tone.PolySynth {
  if (instrumentType === "drums") {
    return new Tone.PolySynth(Tone.MembraneSynth, {
      pitchDecay: 0.02,
      octaves: 2,
    }).toDestination();
  }

  const config = {
    piano: {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.4 },
    },
    guitar: {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.005, decay: 0.08, sustain: 0.2, release: 0.2 },
    },
    bass: {
      oscillator: { type: "square" },
      envelope: { attack: 0.02, decay: 0.15, sustain: 0.4, release: 0.3 },
    },
  } as const;

  return new Tone.PolySynth(Tone.Synth, config[instrumentType]).toDestination();
}

/** solo/mute 叠加后的有效轨道：有 solo 时仅 solo 且未 mute 的轨道发声 */
function effectiveTracks(tracks: Track[]): Track[] {
  const hasSolo = tracks.some((track) => track.solo);
  return tracks.filter((track) => !track.mute && (hasSolo ? track.solo : true));
}

function disposeAll(): void {
  parts.forEach((part) => part.dispose());
  parts = [];
  synths.forEach((synth) => {
    synth.releaseAll();
    synth.dispose();
  });
  synths = [];
}

function rebuild(tracks: Track[], options: PlayOptions): void {
  disposeAll();

  for (const track of effectiveTracks(tracks)) {
    if (track.notes.length === 0) continue;

    const synth = createSynth(track.instrumentType);
    synths.push(synth);

    const events: PartEvent[] = track.notes.map((note) => ({
      time: ticksToTransportTime(note.startTimeTicks),
      pitch: note.pitch,
      durationTicks: note.durationTicks,
      velocity: note.velocity,
    }));

    const part = new Tone.Part<PartEvent>((time, event) => {
      const durationSeconds = (event.durationTicks / TICKS_PER_BEAT) * (60 / options.bpm);
      synth.triggerAttackRelease(
        Tone.Frequency(event.pitch, "midi").toNote(),
        durationSeconds,
        time,
        event.velocity / 127
      );
    }, events);

    part.start(0);
    parts.push(part);
  }

  Tone.Transport.bpm.value = options.bpm;
  Tone.Transport.loop = options.loopEndTicks > options.loopStartTicks;
  if (Tone.Transport.loop) {
    Tone.Transport.loopStart = ticksToTransportTime(options.loopStartTicks);
    Tone.Transport.loopEnd = ticksToTransportTime(options.loopEndTicks);
  }
}

/** 播放：暂停后再次播放会从当前位置继续；停止或刷新后从 0 开始 */
export async function play(tracks: Track[], options: PlayOptions): Promise<void> {
  await ensureAudio();

  const canResume =
    Tone.Transport.state === "paused" && parts.length > 0 && synths.length > 0;

  if (!canResume) {
    rebuild(tracks, options);
  } else {
    Tone.Transport.bpm.value = options.bpm;
  }

  if (Tone.Transport.state !== "started") {
    Tone.Transport.start();
  }
}

/** 暂停：保留当前位置与已调度事件，再次 play 继续 */
export function pause(): void {
  Tone.Transport.pause();
  synths.forEach((synth) => synth.releaseAll());
}

/** 停止：清空位置与所有合成器 */
export function stop(): void {
  Tone.Transport.stop();
  Tone.Transport.cancel();
  Tone.Transport.position = "0:0:0";
  disposeAll();
}

/** 实时改 BPM */
export function setBpm(bpm: number): void {
  Tone.Transport.bpm.value = bpm;
}

/** 实时改循环区域 */
export function setLoop(loopStartTicks: number, loopEndTicks: number): void {
  const loop = loopEndTicks > loopStartTicks;
  Tone.Transport.loop = loop;
  if (loop) {
    Tone.Transport.loopStart = ticksToTransportTime(loopStartTicks);
    Tone.Transport.loopEnd = ticksToTransportTime(loopEndTicks);
  }
}
