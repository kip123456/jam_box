import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { createRoom } from "@/api/rooms";

const NAME_ERROR = "房间名长度必须在 1-50 字符之间";
const PASSWORD_ERROR = "私有房间密码长度必须在 8-32 位之间";

export function CreateRoomDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 50) {
      setError(NAME_ERROR);
      return;
    }
    if (!isPublic && (password.length < 8 || password.length > 32)) {
      setError(PASSWORD_ERROR);
      return;
    }

    setLoading(true);
    try {
      const room = await createRoom({ name: trimmedName, isPublic, password });
      onClose();
      navigate(`/rooms/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建房间失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-room-title"
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <h2 id="create-room-title" className="text-lg font-semibold">
          创建房间
        </h2>

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="room-name">
              房间名
            </label>
            <input
              id="room-name"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={50}
              required
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">房间类型</legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="visibility"
                  checked={isPublic}
                  onChange={() => setIsPublic(true)}
                />
                公开
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="visibility"
                  checked={!isPublic}
                  onChange={() => setIsPublic(false)}
                />
                私有
              </label>
            </div>
          </fieldset>

          {!isPublic && (
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="room-password">
                房间密码
              </label>
              <input
                id="room-password"
                type="password"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
              <p className="text-xs text-muted-foreground">8-32 位，加入房间时需要输入</p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "创建中..." : "创建房间"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
