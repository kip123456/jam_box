import fs from "node:fs";
import path from "node:path";

export interface KnowledgeEntry {
  id: string;
  keywords: string[];
  question: string;
  answer: string;
  category: string;
}

export interface KnowledgeSearchResult {
  /** 最高匹配分（0-1），供路由判断是否直接命中知识库 */
  score: number;
  entries: KnowledgeEntry[];
  /** top 条目答案合并文本，可直接返回给用户 */
  answer: string;
}

const DATA_FILE = path.resolve(__dirname, "../../data/music-theory.json");

let entries: KnowledgeEntry[] | null = null;

/** 启动时加载乐理知识库到内存 */
function loadEntries(): KnowledgeEntry[] {
  if (entries) return entries;
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  entries = JSON.parse(raw) as KnowledgeEntry[];
  return entries;
}

/** 关键词权重：CJK 字符按 2 计，ASCII 按 1 计，让中文短词与英文单词权重可比 */
function keywordWeight(keyword: string): number {
  let weight = 0;
  for (const ch of keyword) {
    weight += ch.charCodeAt(0) > 0xff ? 2 : 1;
  }
  return weight;
}

/**
 * 关键词匹配检索：
 * - 匹配前去掉问题与关键词中的空白，避免中英文混排空格干扰；
 * - 每条目得分 = 命中的最长关键词权重 / 8（封顶 1），长关键词更具体、得分更高；
 * - 单字符关键词权重仅 1（0.125），天然过滤 "C"/"D" 这类噪音命中；
 * - 命中数作为并列时的次级排序，返回 top N 条目与合并答案。
 */
export function search(question: string, topN = 3): KnowledgeSearchResult {
  const normalized = question.toLowerCase().replace(/\s+/g, "");
  const scored = loadEntries()
    .map((entry) => {
      let best = 0;
      let hits = 0;
      for (const kw of entry.keywords) {
        const normalizedKw = kw.toLowerCase().replace(/\s+/g, "");
        if (normalizedKw && normalized.includes(normalizedKw)) {
          hits += 1;
          best = Math.max(best, keywordWeight(normalizedKw));
        }
      }
      return { entry, hits, score: Math.min(1, best / 8) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.hits - a.hits)
    .slice(0, topN);

  if (scored.length === 0) {
    return { score: 0, entries: [], answer: "" };
  }

  return {
    score: scored[0].score,
    entries: scored.map((item) => item.entry),
    answer: scored.map((item) => item.entry.answer).join("\n\n"),
  };
}

/** 测试辅助：清空缓存强制重新加载 */
export function resetKnowledgeBaseForTest(): void {
  entries = null;
}
