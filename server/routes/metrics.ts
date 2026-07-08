import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getRecentSamples, subscribe } from "../metrics";
import { jsonError } from "../api-response";
import { getValidationMessage, metricsQuerySchema } from "@shared/server-schemas";

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
