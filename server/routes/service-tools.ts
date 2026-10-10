import { Hono } from "hono";
import {
  serviceInspectRequestSchema,
  serviceTestRequestSchema,
} from "@shared/service-tools-schemas";
import { describeCheckTarget, resolveCheckTarget } from "@shared/status";
import type { ServiceTestResult } from "@shared/types";
import { normalizeServiceUrl } from "@shared/urls";
import { jsonError } from "../api-response";
import { readValidatedJson } from "../request-body";
import { inspectPage } from "../services/page-inspector";
import { createChecker } from "../status/checker";
import { isSlow } from "../status/state";

const serviceToolsRouter = new Hono();
const runCheck = createChecker();

/** POST /api/service-tools/inspect — { url }: the page's name and icon, for filling in the form */
serviceToolsRouter.post("/inspect", async (c) => {
  const body = await readValidatedJson(c, serviceInspectRequestSchema);
  if (body.response) return body.response;
  const url = normalizeServiceUrl(body.data.url);
  if (!url) return jsonError(c, 400, "service url must be a valid URL");
  return c.json(await inspectPage(url));
});

/** POST /api/service-tools/test — one status check with the form's settings, before saving */
serviceToolsRouter.post("/test", async (c) => {
  const body = await readValidatedJson(c, serviceTestRequestSchema);
  if (body.response) return body.response;
  const { url, check_method, check_target, check_ignore_tls } = body.data;
  const target = resolveCheckTarget({ check_method, check_target: check_target || null }, url);
  if (!target) {
    return jsonError(
      c,
      400,
      check_method === "tcp" ? "check target must be host:port" : "service url must be a valid URL"
    );
  }

  const result = await runCheck({ target, ignoreTls: check_ignore_tls });
  const response: ServiceTestResult = {
    target: describeCheckTarget(target),
    state: !result.ok ? "down" : isSlow(result) ? "degraded" : "up",
    latencyMs: result.latencyMs,
    statusCode: result.statusCode,
    error: result.error,
  };
  return c.json(response);
});

export default serviceToolsRouter;
