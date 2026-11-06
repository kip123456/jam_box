import { Router, Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { BusinessError, ValidationError } from "../lib/errors";
import {
  bulkCreateNotesSchema,
  bulkDeleteNotesSchema,
  bulkUpdateNotesSchema,
  createNoteSchema,
  updateNoteSchema,
} from "../zod/note";
import { firstIssueMessage } from "../lib/validation";
import { serializeNote } from "../lib/track";

/** 挂在 /api/v1/tracks/:trackId/notes 下，上层已校验成员身份并注入 req.track */
export const notesRouter = Router({ mergeParams: true });

/** 确保批量请求中的音符 id 全部属于当前轨道 */
async function assertNotesBelongToTrack(trackId: string, noteIds: string[]): Promise<void> {
  const unique = Array.from(new Set(noteIds));
  const count = await prisma.note.count({ where: { id: { in: unique }, trackId } });
  if (count !== unique.length) {
    throw new BusinessError("音符不存在", 404);
  }
}

/** 获取该轨道所有音符（按开始时间升序） */
notesRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notes = await prisma.note.findMany({
      where: { trackId: req.track!.id },
      orderBy: { startTimeTicks: "asc" },
    });

    res.json(notes.map(serializeNote));
  } catch (err) {
    next(err);
  }
});

/** 创建单个音符 */
notesRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error));
    }

    const note = await prisma.note.create({
      data: { trackId: req.track!.id, ...parsed.data },
    });

    res.json(serializeNote(note));
  } catch (err) {
    next(err);
  }
});

/** 批量创建音符：事务内原子执行，任一失败全部回滚 */
notesRouter.post("/bulk", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = bulkCreateNotesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error));
    }

    const trackId = req.track!.id;
    const created = await prisma.$transaction(
      parsed.data.map((note) => prisma.note.create({ data: { trackId, ...note } }))
    );

    res.json(created.map(serializeNote));
  } catch (err) {
    next(err);
  }
});

/** 批量更新音符：事务内原子执行 */
notesRouter.put("/bulk", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = bulkUpdateNotesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error));
    }

    const trackId = req.track!.id;
    await assertNotesBelongToTrack(
      trackId,
      parsed.data.map((note) => note.id)
    );

    const updated = await prisma.$transaction(
      parsed.data.map(({ id, ...patch }) =>
        prisma.note.update({ where: { id }, data: patch })
      )
    );

    res.json(updated.map(serializeNote));
  } catch (err) {
    next(err);
  }
});

/** 批量删除音符：一条 deleteMany 语句，天然原子 */
notesRouter.delete("/bulk", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = bulkDeleteNotesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error));
    }

    const result = await prisma.note.deleteMany({
      where: { trackId: req.track!.id, id: { in: parsed.data.noteIds } },
    });

    res.json({ deleted: result.count });
  } catch (err) {
    next(err);
  }
});

/** 更新单个音符（部分字段） */
notesRouter.put("/:noteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error));
    }

    const existing = await prisma.note.findFirst({
      where: { id: req.params.noteId, trackId: req.track!.id },
    });
    if (!existing) {
      throw new BusinessError("音符不存在", 404);
    }

    const note = await prisma.note.update({
      where: { id: existing.id },
      data: parsed.data,
    });

    res.json(serializeNote(note));
  } catch (err) {
    next(err);
  }
});

/** 删除单个音符 */
notesRouter.delete("/:noteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.note.findFirst({
      where: { id: req.params.noteId, trackId: req.track!.id },
    });
    if (!existing) {
      throw new BusinessError("音符不存在", 404);
    }

    await prisma.note.delete({ where: { id: existing.id } });

    res.json({ id: existing.id, deleted: true });
  } catch (err) {
    next(err);
  }
});

export default notesRouter;
