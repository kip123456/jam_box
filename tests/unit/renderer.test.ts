import { describe, expect, it } from "vitest";
import { renderTracksToAudio } from "../../backend/src/lib/renderer";
import { encodeWav } from "../../backend/src/lib/wav";

function makeNotes(basePitch: number) {
  return Array.from({ length: 10 }, (_, index) => ({
    pitch: basePitch + (index % 5),
    startTimeTicks: index * 240,
    durationTicks: 200,
    velocity: 100,
  }));
}

describe("renderTracksToAudio", () => {
  it("三条轨道各 10 个音符渲染出非全零的立体声 PCM", async () => {
    const rendered = await renderTracksToAudio(
      [
        { instrumentType: "piano", notes: makeNotes(60) },
        { instrumentType: "guitar", notes: makeNotes(67) },
        {
          instrumentType: "drums",
          notes: [
            { pitch: 36, startTimeTicks: 0, durationTicks: 120 },
            { pitch: 63, startTimeTicks: 240, durationTicks: 120 },
            { pitch: 36, startTimeTicks: 480, durationTicks: 120 },
          ],
        },
      ],
      120,
      1920
    );

    expect(rendered.sampleRate).toBe(44100);
    expect(rendered.left.length).toBeGreaterThan(0);
    expect(rendered.right.length).toBe(rendered.left.length);
    expect(rendered.duration).toBeGreaterThan(0.5);

    let energy = 0;
    for (let index = 0; index < rendered.left.length; index += 1) {
      energy += Math.abs(rendered.left[index]) + Math.abs(rendered.right[index]);
      if (energy > 0) break;
    }
    expect(energy).toBeGreaterThan(0);
  });

  it("静音轨道仍生成合法长度的 PCM（边界）", async () => {
    const rendered = await renderTracksToAudio(
      [{ instrumentType: "piano", mute: true, notes: makeNotes(60) }],
      120,
      480
    );

    expect(rendered.left.length).toBeGreaterThan(0);
    expect(rendered.left.every((value) => value === 0)).toBe(true);
  });
});

describe("encodeWav", () => {
  it("生成标准 RIFF/WAVE 16bit 立体声头，数据长度与样本数一致", () => {
    const frames = 4;
    const left = new Float32Array([0, 0.5, -0.5, 1]);
    const right = new Float32Array([0, -0.5, 0.5, -1]);
    const buffer = encodeWav(44100, left, right);

    expect(buffer.length).toBe(44 + frames * 2 * 2);
    expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buffer.toString("ascii", 8, 12)).toBe("WAVE");
    expect(buffer.toString("ascii", 36, 40)).toBe("data");
    expect(buffer.readUInt16LE(22)).toBe(2);
    expect(buffer.readUInt32LE(24)).toBe(44100);
    expect(buffer.readUInt16LE(34)).toBe(16);
    expect(buffer.readUInt32LE(40)).toBe(frames * 2 * 2);
    expect(buffer.readInt16LE(44)).toBe(0);
    expect(buffer.readInt16LE(46)).toBe(0);
  });
});
