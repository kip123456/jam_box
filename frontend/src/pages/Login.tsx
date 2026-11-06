import { useState } from "react";
import { Button } from "@/components/ui/button";
import client from "@/api/client";

/** 前后端联调用例：提交一个 test 任务并展示后端返回 */
function ApiSmokeTest() {
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const job = await client.post("/jobs", {
        type: "test",
        payload: { foo: "bar" },
      });
      setResult(JSON.stringify(job, null, 2));
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-2">
      <Button onClick={handleClick} disabled={loading}>
        {loading ? "提交中..." : "测试提交任务"}
      </Button>
      {result && (
        <pre className="rounded bg-muted p-3 text-xs text-muted-foreground">{result}</pre>
      )}
    </div>
  );
}

export default function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg border p-8">
        <h1 className="text-2xl font-bold">登录</h1>
        <p className="mt-2 text-sm text-muted-foreground">登录页面占位，Phase 1 实现。</p>
        <ApiSmokeTest />
      </div>
    </div>
  );
}
