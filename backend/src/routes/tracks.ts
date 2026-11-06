import { Router, Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { BusinessError, ValidationError } from "../lib/errors";
import { createTrackSchema, updateTrackSchema } from "../zod/track";
import { firstIssueMessage } from "../lib/validation";
import { requireTrackAccess } from "../middleware/roomMember";
import { serializeTrack, trackInclude } from "../lib/track";

const DEFAULT_COLOR = "#3b82f6";

/** 挂在 /api/v1/rooms/:roomId/tracks 下（需 mergeParams 才能读到 roomId） */
export const roomTracksRouter = Router({ mergeParams: true });

/** 挂在 /api/v1/tracks 下，按 :trackId 定位轨道 */
export const tracksRouter = Router();

/** 创建轨道：position 取该房间当前最大 position + 1 */
roomTracksRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createTrackSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error));
    }

    const room = req.room!;
    const aggregate = await prisma.track.aggregate({
      where: { roomId: room.id },
      _max: { position: true },
    });
    const position = (aggregate._max.position ?? -1) + 1;

    const track = await prisma.track.create({
      data: {
        roomId: room.id,
        name: parsed.data.name,
        instrumentType: parsed.data.instrumentType,
        color: parsed.data.color ?? DEFAULT_COLOR,
        position,
        solo: false,
        mute: false,
        createdById: req.user!.id,
      },
      include: trackInclude,
    });

    res.json(serializeTrack(track));
  } catch (err) {
    next(err);
  }
});

/** 获取房间所有轨道（含音符，按 position 升序） */
roomTracksRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tracks = await prisma.track.findMany({
      where: { roomId: req.room!.id },
      include: trackInclude,
      orderBy: { position: "asc" },
    });

    res.json(tracks.map(serializeTrack));
  } catch (err) {
    next(err);
  }
});

// 单轨道路由统一先校验轨道归属的房间成员身份（use('/:trackId') 才能拿到 trackId 参数）
tracksRouter.use("/:trackId", requireTrackAccess);

/** 获取单轨道（含音符） */
tracksRouter.get("/:trackId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const track = await prisma.track.findUnique({
      where: { id: req.track!.id },
      include: trackInclude,
    });
    if (!track) {
      throw new BusinessError("轨道不存在", 404);
    }

    res.json(serializeTrack(track));
  } catch (err) {
    next(err);
  }
});

/** 更新轨道：仅允许 name/solo/mute/color/position */
tracksRouter.put("/:trackId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateTrackSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error));
    }

    const { name, solo, mute, color, position } = parsed.data;
    const data = {
      ...(name !== undefined ? { name } : {}),
      ...(solo !== undefined ? { solo } : {}),
      ...(mute !== undefined ? { mute } : {}),
      ...(color !== undefined ? { color } : {}),
      ...(position !== undefined ? { position } : {}),
    };

    const track = await prisma.track.update({
      where: { id: req.track!.id },
      data,
      include: trackInclude,
    });

    res.json(serializeTrack(track));
  } catch (err) {
    next(err);
  }
});

/** 删除轨道（数据库外键级联删除其所有音符） */
tracksRouter.delete("/:trackId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.track.delete({ where: { id: req.track!.id } });

    res.json({ id: req.track!.id, deleted: true });
  } catch (err) {
    next(err);
  }
});

export default roomTracksRouter;
