import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getRecentSamples, subscribe } from "../metrics";

const metricsRouter = new Hono();

/** GET /api/metrics?window=30 */
metricsRouter.get("/", (c) => {
  const windowParam = c.req.query("window");
  const windowSec = windowParam ? parseInt(windowParam, 10) : 30;
  const samples = getRecentSamples(windowSec);
  return c.json({ samples });
});

/** GET /api/metrics/stream — SSE endpoint */
metricsRouter.get("/stream", (c) => {
  return streamSSE(c, async (stream) => {
    let alive = true;

    const unsubscribe = subscribe((sample) => {
      if (!alive) return;
      stream.writeSSE({
        event: "sample",
        data: JSON.stringify(sample),
      }).catch(() => {
        alive = false;
      });
    });

    // Keep alive with comment pings every 15s
    const keepAlive = setInterval(() => {
      if (!alive) return;
      stream.writeSSE({ event: "ping", data: "" }).catch(() => {
        alive = false;
      });
    }, 15000);

    // Wait until connection closes
    stream.onAbort(() => {
      alive = false;
      clearInterval(keepAlive);
      unsubscribe();
    });

    // Keep the stream open
    while (alive) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    clearInterval(keepAlive);
    unsubscribe();
  });
});

export default metricsRouter;
