import fs from "node:fs";
import path from "node:path";

const PROMPTS_DIR = path.resolve(__dirname, "../../prompts");

let templates: Map<string, string> | null = null;

/** 启动时加载 prompts/*.md 到内存（key = 文件名不含扩展名） */
function loadTemplates(): Map<string, string> {
  if (templates) return templates;
  templates = new Map();
  if (fs.existsSync(PROMPTS_DIR)) {
    for (const file of fs.readdirSync(PROMPTS_DIR)) {
      if (file.endsWith(".md")) {
        const name = path.basename(file, ".md");
        templates.set(name, fs.readFileSync(path.join(PROMPTS_DIR, file), "utf-8"));
      }
    }
  }
  return templates;
}

/**
 * 渲染 prompt 模板：把 {placeholder} 替换为 vars 中对应的值。
 * vars 中不存在的占位符原样保留，便于发现模板写错。
 */
export function render(templateName: string, vars: Record<string, string | number>): string {
  const template = loadTemplates().get(templateName);
  if (!template) {
    throw new Error(`Prompt 模板不存在: ${templateName}`);
  }
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{${key}}`).join(String(value));
  }
  return result;
}

/** 测试辅助：清空缓存强制重新加载 */
export function resetPromptCacheForTest(): void {
  templates = null;
}
