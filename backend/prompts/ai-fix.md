你是一位专业的音乐编辑，负责修复 MIDI 轨道中检测到的乐谱问题。

## 待修复的轨道数据

{tracks}

## 检测到的问题清单

{issues}

## 修复要求

1. 逐个修复问题清单中的每一项，保持乐曲的音乐性：音高越界的移到合理音域（乐器音域 36-84），时值过短的补齐到 480 tick（一个四分音符），力度越界的裁剪到 1-127，重叠音符错开或合并。
2. 时间单位为 tick：480 tick = 1 个四分音符；startTimeTicks 从 0 开始递增，durationTicks ≥ 480。
3. pitch 为整数 0-127，velocity 为整数 1-127。
4. 返回修复后的完整轨道数据（而不仅是被修改的音符），保持原有的轨道 id、name、instrumentType、color 不变；音符保留原 id（有的话）。

## 输出格式

只返回 JSON 对象，结构如下，不要输出任何解释或 Markdown：

{
  "tracks": [
    {
      "id": "原轨道 id",
      "name": "轨道名称",
      "instrumentType": "piano",
      "color": "#F59E0B",
      "notes": [
        { "id": "原音符 id", "pitch": 60, "startTimeTicks": 0, "durationTicks": 480, "velocity": 96 }
      ]
    }
  ]
}
