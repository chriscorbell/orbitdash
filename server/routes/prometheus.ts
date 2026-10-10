import { createHash, timingSafeEqual } from "crypto";
import { Hono } from "hono";
import { metricAlerts } from "../alerts/service";
import { jsonError } from "../api-response";
import { getAuthConfig } from "../auth/service";
import { getDb } from "../db";
import { dockerMonitor } from "../docker/monitor";
import { getLatestSnapshot } from "../metrics";
import { renderPrometheus } from "../prometheus";
import { listServices } from "../services/service-operations";
import { readStoredStatuses } from "../status/store";
import { readUptimeSeconds } from "../system-info";

export interface PrometheusConfig {
  enabled: boolean;
  token: string | null;
}

/** ORBITDASH_PROMETHEUS=true turns /metrics on; ORBITDASH_PROMETHEUS_TOKEN asks scrapers for it. */
export function readPrometheusConfig(
  env: Record<string, string | undefined> = process.env
): PrometheusConfig {
  const flag = (env.ORBITDASH_PROMETHEUS ?? "").trim().toLowerCase();
  return {
    enabled: ["1", "true", "on", "yes"].includes(flag),
    token: env.ORBITDASH_PROMETHEUS_TOKEN?.trim() || null,
  };
}

const digest = (value: string) => createHash("sha256").update(value).digest();

function tokenMatches(header: string | undefined, token: string): boolean {
  const presented = /^Bearer\s+(.+)$/i.exec(header ?? "")?.[1]?.trim() ?? "";
  return timingSafeEqual(digest(presented), digest(token));
}

const prometheusRouter = new Hono();

/**
 * GET /metrics — host, service check and container metrics for Prometheus. Off unless enabled;
 * while sign-in is on it also needs a token, since the dashboard's session can't be scraped.
 */
prometheusRouter.get("/", (c) => {
  const config = readPrometheusConfig();
  if (!config.enabled) return jsonError(c, 404, "not found");
  if (config.token) {
    if (!tokenMatches(c.req.header("Authorization"), config.token)) {
      c.header("WWW-Authenticate", 'Bearer realm="orbitdash"');
      return jsonError(c, 401, "a valid bearer token is required");
    }
  } else if (getAuthConfig().mode !== "none") {
    return jsonError(c, 403, "set ORBITDASH_PROMETHEUS_TOKEN to scrape while sign-in is on");
  }

  const body = renderPrometheus({
    snapshot: getLatestSnapshot(),
    uptimeSeconds: readUptimeSeconds(),
    services: listServices(),
    statuses: readStoredStatuses(getDb()),
    docker: dockerMonitor.snapshot(),
    alertsFiring: metricAlerts.read().active.length,
  });
  c.header("Cache-Control", "no-store");
  return c.text(body, 200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
});

export default prometheusRouter;
