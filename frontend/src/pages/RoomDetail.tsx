import { Link, useParams } from "react-router-dom";

export default function RoomDetail() {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl">
        <Link className="text-sm underline underline-offset-4" to="/rooms">
          ← 返回房间列表
        </Link>
        <h1 className="mt-4 text-2xl font-bold">房间详情</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          房间 {roomId} 的详情页占位，Phase 3 实现多轨编曲。
        </p>
      </div>
    </div>
  );
}
