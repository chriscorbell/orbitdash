import { Hono } from "hono";
import { z } from "zod";
import type { DiscoveryResponse } from "@shared/types";
import { readValidatedJson } from "../request-body";
import {
  buildSuggestions,
  dismissedCount,
  dismissSuggestion,
  restoreDismissed,
} from "../docker/discovery";
import { dockerMonitor } from "../docker/monitor";
import { listServices } from "../services/service-operations";

const discoveryRouter = new Hono();
const dismissSchema = z.object({ key: z.string().trim().min(1).max(200) }).strict();

/** GET /api/discovery — running containers that could be added as services */
discoveryRouter.get("/", async (c) => {
  const response: DiscoveryResponse = {
    suggestions: dockerMonitor.snapshot().available
      ? await buildSuggestions(dockerMonitor.labeled(), listServices())
      : [],
    dismissed: dismissedCount(),
  };
  c.header("Cache-Control", "no-store");
  return c.json(response);
});

/** POST /api/discovery/dismiss — { key }: stop suggesting this container */
discoveryRouter.post("/dismiss", async (c) => {
  const body = await readValidatedJson(c, dismissSchema);
  if (body.response) return body.response;
  dismissSuggestion(body.data.key);
  return c.json({ success: true });
});

/** DELETE /api/discovery/dismissed — suggest every dismissed container again */
discoveryRouter.delete("/dismissed", (c) => c.json({ restored: restoreDismissed() }));

export default discoveryRouter;
