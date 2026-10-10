import { Hono } from "hono";
import { jsonError, respondApiResult } from "../api-response";
import { getDataDir, getDb } from "../db";
import { parseJsonBody } from "../request-body";
import { createSnapshot, listSnapshots } from "../services/backup-snapshots";
import { exportBackup, importBackup } from "../services/backup-transfer";

const backupRouter = new Hono();

/** GET /api/backup/export — downloads services, settings and icons as one JSON file */
backupRouter.get("/export", (c) => {
  const document = exportBackup();
  const day = document.exportedAt.slice(0, 10);
  c.header("Content-Disposition", `attachment; filename="orbitdash-backup-${day}.json"`);
  c.header("Cache-Control", "no-store");
  return c.json(document);
});

/** POST /api/backup/import — replaces everything with an exported backup */
backupRouter.post("/import", async (c) => {
  const parsedBody = await parseJsonBody(c.req.raw);
  if (!parsedBody.success) {
    return jsonError(c, parsedBody.status ?? 400, parsedBody.error ?? "invalid request body");
  }

  return respondApiResult(c, importBackup(parsedBody.data));
});

/** GET /api/backup/snapshots — automatic and manual restore points, newest first */
backupRouter.get("/snapshots", (c) => {
  return c.json({ snapshots: listSnapshots(getDataDir()) });
});

/** POST /api/backup/snapshots — takes a manual snapshot now */
backupRouter.post("/snapshots", (c) => {
  return c.json(createSnapshot(getDb(), getDataDir(), "manual"), 201);
});

export default backupRouter;
