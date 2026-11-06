/** 把一个通道的浮点样本转换为 16 位 PCM 写入缓冲区 */
function writeFloatChannel(buffer: Buffer, channel: Float32Array, frames: number, startOffset: number, stride: number): void {
  let offset = startOffset;
  for (let index = 0; index < frames; index += 1) {
    const sample = Math.max(-1, Math.min(1, channel[index] ?? 0));
    const pcm = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
    buffer.writeInt16LE(pcm, offset);
    offset += stride;
  }
}

/** 手写 WAV（RIFF/PCM 16-bit 立体声）头 + Float32 → Int16 */
export function encodeWav(sampleRate: number, left: Float32Array, right: Float32Array): Buffer {
  const channels = 2;
  const frames = Math.min(left.length, right.length);
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // fmt chunk 大小
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // 位深
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  // 交错写入：L, R, L, R ...
  writeFloatChannel(buffer, left, frames, 44, blockAlign);
  writeFloatChannel(buffer, right, frames, 46, blockAlign);

  return buffer;
}
