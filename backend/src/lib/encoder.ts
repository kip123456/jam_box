import fs from "fs";
import { spawn } from "child_process";

/** 检查系统是否有可用的 ffmpeg 可执行文件 */
export function isFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const probe = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
      probe.on("error", () => resolve(false));
      probe.on("close", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

/**
 * WAV → MP3（128kbps）。
 * 成功返回 true；ffmpeg 不存在或编码失败返回 false，由调用方降级保存 WAV。
 */
export async function encodeMp3(wavBuffer: Buffer, outputPath: string): Promise<boolean> {
  if (!(await isFfmpegAvailable())) {
    console.warn("[export] ffmpeg 不可用，降级保存 WAV");
    return false;
  }

  return new Promise((resolve) => {
    const ffmpeg = spawn(
      "ffmpeg",
      ["-y", "-i", "pipe:0", "-ar", "44100", "-ac", "2", "-b:a", "128k", "-f", "mp3", outputPath],
      { stdio: ["pipe", "ignore", "ignore"] }
    );

    ffmpeg.on("error", (err) => {
      console.warn(`[export] ffmpeg 启动失败，降级保存 WAV: ${err.message}`);
      fs.rm(outputPath, { force: true }, () => undefined);
      resolve(false);
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        console.warn(`[export] ffmpeg 退出码 ${code}，降级保存 WAV`);
        fs.rm(outputPath, { force: true }, () => undefined);
        resolve(false);
        return;
      }
      resolve(true);
    });

    ffmpeg.stdin.end(wavBuffer);
  });
}
