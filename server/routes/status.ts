import { Hono } from "hono";
import { getValidationMessage } from "@shared/service-schemas";
import { statusHistoryQuerySchema } from "@shared/status-schemas";
import { jsonError, jsonNotFound } from "../api-response";
import { statusMonitor } from "../status/monitor";

const statusRouter = new Hono();

/** GET /api/status — current status of every service with checks on; updates arrive on `status`. */
statusRouter.get("/", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ statuses: statusMonitor.list() });
});

/** GET /api/status/:id/history?range=24h|30d — 48 half hours, or 30 days, oldest first. */
statusRouter.get("/:id/history", (c) => {
  const result = statusHistoryQuerySchema.safeParse(c.req.query());
  if (!result.success) {
    return jsonError(c, 400, getValidationMessage(result.error));
  }

  const history = statusMonitor.history(c.req.param("id"), result.data.range, Date.now());
  if (!history) {
    return jsonNotFound(c);
  }

  c.header("Cache-Control", "no-store");
  return c.json(history);
});

export default statusRouter;
