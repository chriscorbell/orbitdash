import { Hono } from "hono";
import { alertRulesUpdateSchema } from "@shared/alert-schemas";
import type { AlertRule } from "@shared/types";
import { metricAlerts } from "../alerts/service";
import { readValidatedJson } from "../request-body";

const alertsRouter = new Hono();

/** GET /api/alerts — firing alerts, recent resolved ones, and the rules */
alertsRouter.get("/", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(metricAlerts.read());
});

/** PUT /api/alerts/rules — { rules } for any of cpu, memory, disk and temperature */
alertsRouter.put("/rules", async (c) => {
  const body = await readValidatedJson(c, alertRulesUpdateSchema);
  if (body.response) return body.response;
  return c.json({ rules: metricAlerts.updateRules(body.data.rules as AlertRule[]) });
});

export default alertsRouter;
