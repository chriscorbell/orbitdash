import { Hono } from "hono";
import { serviceMoveSchema, serviceReorderSchema } from "@shared/server-schemas";
import { jsonError, respondApiResult } from "../api-response";
import { readValidatedJson } from "../request-body";
import {
  createService,
  deleteService,
  duplicateService,
  listServices,
  moveService,
  reorderServices,
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

/** PUT /api/services/order — { category_id, ids } within one category */
servicesRouter.put("/order", async (c) => {
  const body = await readValidatedJson(c, serviceReorderSchema);
  if (body.response) return body.response;
  return respondApiResult(c, reorderServices(body.data));
});

/** POST /api/services/:id/move — { category_id, index } */
servicesRouter.post("/:id/move", async (c) => {
  const body = await readValidatedJson(c, serviceMoveSchema);
  if (body.response) return body.response;
  return respondApiResult(c, moveService(c.req.param("id"), body.data));
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
