import { Hono } from "hono";
import { jsonError, respondApiResult } from "../api-response";
import {
  createService,
  deleteService,
  duplicateService,
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
    return jsonError(c, parsedPayload.status, parsedPayload.error);
  }

  return respondApiResult(c, await createService(parsedPayload), 201);
});

/** POST /api/services/:id/duplicate */
servicesRouter.post("/:id/duplicate", (c) => {
  const id = c.req.param("id");
  return respondApiResult(c, duplicateService(id), 201);
});

/** PUT /api/services/:id */
servicesRouter.put("/:id", async (c) => {
  const id = c.req.param("id");
  const parsedPayload = await parseUpdateServiceRequest(c.req.raw);
  if ("error" in parsedPayload) {
    return jsonError(c, parsedPayload.status, parsedPayload.error);
  }

  return respondApiResult(c, await updateService(id, parsedPayload));
});

/** DELETE /api/services/:id */
servicesRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  return respondApiResult(c, deleteService(id));
});

export default servicesRouter;
