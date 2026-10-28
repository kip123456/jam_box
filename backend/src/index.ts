import express, { Request, Response } from "express";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.get("/health", (_req: Request, res: Response) => {
  res.json({ code: 0, msg: "ok", data: { status: "UP" } });
});

app.get("/api/v1/hello", (_req: Request, res: Response) => {
  res.json({ code: 0, msg: "ok", data: "Hello from Jam Box backend" });
});

app.listen(PORT, () => {
  console.log(`[backend] listening on port ${PORT}`);
});