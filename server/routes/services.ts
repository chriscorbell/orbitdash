import { Hono } from "hono";
import {
  createService,
  deleteService,
  listServices,
  updateService,
} from "../services/service-operations";
import { parseCreateServiceRequest, parseUpdateServiceRequest } from "../services/service-payloads";

const servicesRouter = new Hono();

/** GET /api/services */
servicesRouter.get("/", (c) => {
  return c.json(listServices());
});

/** POST /api/services */
servicesRouter.post("/", async (c) => {
  const parsedPayload = await parseCreateServiceRequest(c.req.raw);
  if ("error" in parsedPayload) {
    return c.json({ error: parsedPayload.error }, parsedPayload.status);
  }

  const result = await createService(parsedPayload);
  if (!result.success) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.value, 201);
});

/** PUT /api/services/:id */
servicesRouter.put("/:id", async (c) => {
  const id = c.req.param("id");
  const parsedPayload = await parseUpdateServiceRequest(c.req.raw);
  if ("error" in parsedPayload) {
    return c.json({ error: parsedPayload.error }, parsedPayload.status);
  }

  const result = await updateService(id, parsedPayload);
  if (!result.success) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.value);
});

/** DELETE /api/services/:id */
servicesRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  const result = deleteService(id);
  if (!result.success) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.value);
});

export default servicesRouter;
