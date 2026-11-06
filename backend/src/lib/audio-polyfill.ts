/**
 * 必须在 import "tone" 之前执行。
 * Tone.js 的 OfflineContext 依赖浏览器原生 Web Audio 构造函数，
 * Node.js 环境用 node-web-audio-api 提供 OfflineAudioContext / AudioParam 等实现。
 */
const nodeWebAudio = require("node-web-audio-api") as Record<string, unknown>;

const globalScope = globalThis as unknown as Record<string, unknown>;

if (typeof globalScope.window === "undefined") {
  globalScope.window = globalScope;
}

const windowScope = globalScope.window as Record<string, unknown>;

for (const [key, value] of Object.entries(nodeWebAudio)) {
  if (typeof value === "function" && !(key in windowScope)) {
    windowScope[key] = value;
  }
}
