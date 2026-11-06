import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { listRooms, type RoomSummary } from "@/api/rooms";
import { CreateRoomDialog } from "@/components/rooms/CreateRoomDialog";
import { JoinRoomDialog } from "@/components/rooms/JoinRoomDialog";

type DialogKind = "create" | "join" | null;

export default function Rooms() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<DialogKind>(null);

  useEffect(() => {
    let cancelled = false;

    listRooms()
      .then((data) => {
        if (!cancelled) setRooms(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载房间列表失败");
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
            <h1 className="text-2xl font-bold">房间列表</h1>
            <p className="mt-1 text-sm text-muted-foreground">加入一个公开房间，或创建自己的合奏房间。</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDialog("join")}>
              加入房间
            </Button>
            <Button onClick={() => setDialog("create")}>创建房间</Button>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="mt-8 text-sm text-muted-foreground">加载中...</p>
        ) : rooms.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">暂无活跃的公开房间，创建一个吧。</p>
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
                <p className="mt-1 text-sm text-muted-foreground">成员：{room.memberCount} 人</p>
                <div className="mt-4 flex justify-end">
                  <Button
                    size="sm"
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => navigate(`/rooms/${room.id}`)}
                  >
                    进入房间
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {dialog === "create" && <CreateRoomDialog onClose={() => setDialog(null)} />}
      {dialog === "join" && <JoinRoomDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
