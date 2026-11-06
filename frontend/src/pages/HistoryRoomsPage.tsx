import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { listEndedRooms, type EndedRoomSummary } from "@/api/rooms";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
}

export default function HistoryRoomsPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<EndedRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    listEndedRooms()
      .then((data) => {
        if (!cancelled) setRooms(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载我的合奏失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">我的合奏</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              你参与过的已结束房间，可回放音轨并导出音频。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/rooms")}>
              返回房间列表
            </Button>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="mt-8 text-sm text-muted-foreground">加载中...</p>
        ) : rooms.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">
            暂无已结束的合奏。结束一次房间后，记录会出现在这里。
          </p>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <article
                key={room.id}
                className="group rounded-lg border bg-background p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold">{room.name}</h2>
                  <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {room.roomNumber}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">房主：{room.owner.username}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  成员：{room.memberCount} 人 · 轨道：{room.trackCount} 条
                </p>
                <p className="mt-1 text-sm text-muted-foreground">BPM：{room.bpm}</p>
                <p className="mt-1 text-sm text-muted-foreground">结束于：{formatDate(room.endedAt)}</p>
                <div className="mt-4 flex items-center justify-between gap-2">
                  {room.isHost ? (
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                      我是房主
                    </span>
                  ) : (
                    <span />
                  )}
                  <Button size="sm" onClick={() => navigate(`/rooms/${room.id}`)}>
                    查看回放
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <p className="mx-auto mt-8 max-w-5xl text-xs text-muted-foreground">
        想继续合奏？<Link className="underline underline-offset-2" to="/rooms">去房间列表</Link>
      </p>
    </div>
  );
}
