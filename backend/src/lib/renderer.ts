// 必须在导入 tone 之前补齐 Node.js 的 Web Audio 原生构造函数
import "./audio-polyfill";
import * as Tone from "tone";

/** MVP 固定 480 ticks = 1/4 拍（与前端一致） */
export const TICKS_PER_BEAT = 480;
export const MIN_BPM = 40;
export const MAX_BPM = 240;
/** 单次导出上限：16 小节 ≈ 60 秒 */
export const MAX_DURATION_TICKS = 16 * 4 * TICKS_PER_BEAT;
const SAMPLE_RATE = 44100;

export interface RenderableNote {
  pitch: number;
  startTimeTicks: number;
  durationTicks: number;
  velocity?: number;
}

export interface RenderableTrack {
  instrumentType: string;
  solo?: boolean;
  mute?: boolean;
  notes: RenderableNote[];
}

export interface RenderedAudio {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
  duration: number;
}

interface Voice {
  trigger: (pitch: number, durationSeconds: number, startSeconds: number, velocity: number) => void;
  dispose: () => void;
}

function midiToFrequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

/** 乐器类型 → Tone.js 音色（MVP 只求音色近似） */
function createVoice(instrumentType: string, destination: Tone.ToneAudioNode): Voice {
  switch (instrumentType) {
    case "guitar": {
      const synth = new Tone.PolySynth(Tone.FMSynth).connect(destination);
      return {
        trigger: (pitch, durationSeconds, startSeconds, velocity) =>
          synth.triggerAttackRelease(midiToFrequency(pitch), durationSeconds, startSeconds, velocity),
        dispose: () => synth.dispose(),
      };
    }
    case "bass": {
      const synth = new Tone.MonoSynth().connect(destination);
      return {
        trigger: (pitch, durationSeconds, startSeconds, velocity) =>
          synth.triggerAttackRelease(midiToFrequency(pitch - 12), durationSeconds, startSeconds, velocity),
        dispose: () => synth.dispose(),
      };
    }
    case "drums": {
      const kick = new Tone.MembraneSynth().connect(destination);
      const hat = new Tone.MetalSynth().connect(destination);
      return {
        trigger: (pitch, durationSeconds, startSeconds, velocity) => {
          if (pitch >= 60) {
            // 高音区简化成 hihat
            hat.triggerAttackRelease("32n", startSeconds, velocity);
          } else {
            kick.triggerAttackRelease(midiToFrequency(pitch), durationSeconds, startSeconds, velocity);
          }
        },
        dispose: () => {
          kick.dispose();
          hat.dispose();
        },
      };
    }
    default: {
      const synth = new Tone.PolySynth(Tone.Synth).connect(destination);
      return {
        trigger: (pitch, durationSeconds, startSeconds, velocity) =>
          synth.triggerAttackRelease(midiToFrequency(pitch), durationSeconds, startSeconds, velocity),
        dispose: () => synth.dispose(),
      };
    }
  }
}

/** 渲染：把轨道和音符混合成左右声道 PCM */
export async function renderTracksToAudio(
  tracks: RenderableTrack[],
  bpm: number,
  durationTicks: number
): Promise<RenderedAudio> {
  const safeBpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
  const safeTicks = Math.max(
    TICKS_PER_BEAT,
    Math.min(MAX_DURATION_TICKS, Math.round(durationTicks))
  );
  const duration = (safeTicks * 60) / (TICKS_PER_BEAT * safeBpm);
  const secondsPerTick = 60 / (TICKS_PER_BEAT * safeBpm);

  const hasSolo = tracks.some((track) => track.solo);
  const effectiveTracks = tracks.filter(
    (track) => !track.mute && (hasSolo ? Boolean(track.solo) : true) && track.notes.length > 0
  );

  const buffer = await Tone.Offline(
    () => {
      // 轨道越多越容易叠加削波，按轨道数收一点总音量
      const masterGain =
        effectiveTracks.length <= 1 ? 0.8 : effectiveTracks.length === 2 ? 0.5 : 0.35;
      const master = new Tone.Gain(masterGain).toDestination();

      for (const track of effectiveTracks) {
        const voice = createVoice(track.instrumentType, master);
        for (const note of track.notes) {
          const startSeconds = Math.max(0, note.startTimeTicks * secondsPerTick);
          if (startSeconds >= duration) continue;

          const noteSeconds = Math.max(0.02, note.durationTicks * secondsPerTick);
          const velocity = Math.min(1, Math.max(0, (note.velocity ?? 100) / 127));
          voice.trigger(note.pitch, noteSeconds, startSeconds, velocity);
        }
        // 离线渲染结束后整个 context 会被丢弃，这里不提前 dispose，避免音符被截断
      }
    },
    duration,
    2,
    SAMPLE_RATE
  );

  return {
    sampleRate: buffer.sampleRate,
    left: new Float32Array(buffer.getChannelData(0)),
    right: new Float32Array(buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)),
    duration: buffer.duration,
  };
}
