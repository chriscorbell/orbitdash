import { Hono } from "hono";
import { compress } from "hono/compress";
import { streamSSE } from "hono/streaming";
import { getLatestSnapshot, getRecentSamples, subscribe } from "../metrics";
import { jsonError } from "../api-response";
import { metricHistory } from "../history/recorder";
import {
  getValidationMessage,
  metricHistoryQuerySchema,
  metricsQuerySchema,
} from "@shared/server-schemas";

const metricsRouter = new Hono();

/** GET /api/metrics?window=30 */
metricsRouter.get("/", (c) => {
  const result = metricsQuerySchema.safeParse(c.req.query());

  if (!result.success) {
    return jsonError(c, 400, getValidationMessage(result.error));
  }

  const samples = getRecentSamples(result.data.window);
  return c.json({ samples });
});

/** GET /api/metrics/host — the latest full HostSnapshot; live ones arrive on the `host` topic. */
metricsRouter.get("/host", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(getLatestSnapshot());
});

/**
 * GET /api/metrics/history?range=1h|24h|7d|30d — rolled-up history as columnar arrays. Compressed
 * because 30 days of quarter hours is a few hundred kilobytes of JSON.
 */
metricsRouter.get("/history", compress(), (c) => {
  const result = metricHistoryQuerySchema.safeParse(c.req.query());

  if (!result.success) {
    return jsonError(c, 400, getValidationMessage(result.error));
  }

  c.header("Cache-Control", "no-store");
  return c.json(metricHistory.read(result.data.range, Date.now()));
});

/** GET /api/metrics/stream — SSE endpoint */
metricsRouter.get("/stream", (c) => {
  return streamSSE(c, async (stream) => {
    let finish = () => {};
    const closed = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const unsubscribe = subscribe((sample) => {
      stream
        .writeSSE({
          event: "sample",
          data: JSON.stringify(sample),
        })
        .catch(finish);
    });

    // Keep alive with comment pings every 15s
    const keepAlive = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" }).catch(finish);
    }, 15000);

    stream.onAbort(finish);

    // Hold the stream open until the client disconnects or a write fails
    await closed;
    clearInterval(keepAlive);
    unsubscribe();
  });
});

export default metricsRouter;
