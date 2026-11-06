import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import client from "@/api/client";
import { useUserStore, type User } from "@/store/user";

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const registered = new URLSearchParams(location.search).get("registered") === "1";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = (await client.post("/auth/login", {
        username,
        password,
      })) as unknown as LoginResult;

      useUserStore.setState({
        token: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      navigate("/rooms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg border p-8">
        <h1 className="text-2xl font-bold">登录</h1>
        <p className="mt-2 text-sm text-muted-foreground">登录后即可加入合奏房间。</p>

        {registered && (
          <p className="mt-4 rounded bg-muted px-3 py-2 text-sm text-muted-foreground">
            注册成功，请登录。
          </p>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="username">
              用户名
            </label>
            <input
              id="username"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="password">
              密码
            </label>
            <input
              id="password"
              type="password"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          还没有账号？{" "}
          <Link className="underline underline-offset-4" to="/register">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  );
}
