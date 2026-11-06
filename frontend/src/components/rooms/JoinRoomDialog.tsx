import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { listRooms, joinRoom } from "@/api/rooms";

export function JoinRoomDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [roomNumber, setRoomNumber] = useState("");
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const trimmed = roomNumber.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("请输入 6 位数字房间号");
      return;
    }

    setLoading(true);
    try {
      if (!needPassword) {
        const rooms = await listRooms();
        const found = rooms.find((room) => room.roomNumber === trimmed);

        if (found) {
          const room = await joinRoom(trimmed);
          onClose();
          navigate(`/rooms/${room.id}`);
          return;
        }

        // 公开列表里没有：可能是私有房间、已锁定或已结束，先让用户补密码
        setNeedPassword(true);
        setHint("未找到公开房间。若这是私有房间，请输入房间密码后加入。");
        return;
      }

      const room = await joinRoom(trimmed, password);
      onClose();
      navigate(`/rooms/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入房间失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-room-title"
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <h2 id="join-room-title" className="text-lg font-semibold">
          加入房间
        </h2>

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="join-room-number">
              房间号
            </label>
            <input
              id="join-room-number"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={roomNumber}
              onChange={(event) => {
                setRoomNumber(event.target.value);
                setNeedPassword(false);
                setHint("");
              }}
              placeholder="6 位数字"
              maxLength={6}
              required
            />
          </div>

          {needPassword && (
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="join-room-password">
                房间密码
              </label>
              <input
                id="join-room-password"
                type="password"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          )}

          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "加入中..." : needPassword ? "确认加入" : "加入房间"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
