import { Hono } from "hono";
import { dockerMonitor } from "../docker/monitor";

const dockerRouter = new Hono();

/** GET /api/docker — containers with state, health and resources, or why Docker isn't there */
dockerRouter.get("/", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(dockerMonitor.snapshot());
});

export default dockerRouter;
