import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { parseEventTopics } from "@shared/events";
import { subscribeEvents } from "../events";
import { subscribe as subscribeMetrics } from "../metrics";

const eventsRouter = new Hono();

export const KEEP_ALIVE_MS = 15_000;

/**
 * GET /api/events?topics=metrics,config — one SSE stream per tab. The metrics collector only
 * samples every second while some stream includes the metrics topic.
 */
eventsRouter.get("/", (c) => {
  const topics = parseEventTopics(c.req.query("topics"));

  return streamSSE(c, async (stream) => {
    let finish = () => {};
    const closed = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const send = (event: string, data: unknown) => {
      stream.writeSSE({ event, data: JSON.stringify(data) }).catch(finish);
    };

    const unsubscribers = [
      subscribeEvents(topics, (event) => send(event.type, event)),
      ...(topics.includes("metrics")
        ? [subscribeMetrics((sample) => send("metrics", { type: "metrics", sample }))]
        : []),
    ];

    send("ready", { topics });
    const keepAlive = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" }).catch(finish);
    }, KEEP_ALIVE_MS);

    stream.onAbort(finish);
    await closed;
    clearInterval(keepAlive);
    for (const unsubscribe of unsubscribers) unsubscribe();
  });
});

export default eventsRouter;
