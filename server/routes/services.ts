import { Hono } from "hono";
import {
  serviceBulkChecksSchema,
  serviceBulkIdsSchema,
  serviceBulkMoveSchema,
  serviceMoveSchema,
  serviceReorderSchema,
} from "@shared/server-schemas";
import { jsonError, respondApiResult } from "../api-response";
import { canEdit } from "../auth/http";
import { readValidatedJson } from "../request-body";
import {
  bulkDeleteServices,
  bulkMoveServices,
  bulkRestoreServices,
  bulkUpdateServiceChecks,
} from "../services/service-bulk";
import {
  createService,
  deleteService,
  duplicateService,
  listServices,
  moveService,
  reorderServices,
  restoreDeletedService,
  updateService,
} from "../services/service-operations";
import { parseCreateServiceRequest, parseUpdateServiceRequest } from "../services/service-payloads";

const servicesRouter = new Hono();

/**
 * GET /api/services. Guests get no status check targets: a target can hold credentials, and only
 * the service form, which guests never see, uses it.
 */
servicesRouter.get("/", (c) => {
  const services = listServices();
  return c.json(
    canEdit(c) ? services : services.map((service) => ({ ...service, check_target: null }))
  );
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

// Bulk actions are registered before the /:id routes, so "bulk" is never read as an id.

/** POST /api/services/bulk/move — { ids, category_id } */
servicesRouter.post("/bulk/move", async (c) => {
  const body = await readValidatedJson(c, serviceBulkMoveSchema);
  if (body.response) return body.response;
  return respondApiResult(c, bulkMoveServices(body.data));
});

/** POST /api/services/bulk/delete — { ids }; undone by /bulk/restore */
servicesRouter.post("/bulk/delete", async (c) => {
  const body = await readValidatedJson(c, serviceBulkIdsSchema);
  if (body.response) return body.response;
  return respondApiResult(c, bulkDeleteServices(body.data.ids));
});

/** POST /api/services/bulk/restore — { ids } */
servicesRouter.post("/bulk/restore", async (c) => {
  const body = await readValidatedJson(c, serviceBulkIdsSchema);
  if (body.response) return body.response;
  return respondApiResult(c, bulkRestoreServices(body.data.ids));
});

/** POST /api/services/bulk/checks — { ids, check_enabled?, check_interval? } */
servicesRouter.post("/bulk/checks", async (c) => {
  const body = await readValidatedJson(c, serviceBulkChecksSchema);
  if (body.response) return body.response;
  return respondApiResult(c, bulkUpdateServiceChecks(body.data));
});

/** POST /api/services/:id/move — { category_id, index } */
servicesRouter.post("/:id/move", async (c) => {
  const body = await readValidatedJson(c, serviceMoveSchema);
  if (body.response) return body.response;
  return respondApiResult(c, moveService(c.req.param("id"), body.data));
});

/** POST /api/services/:id/restore — undoes a recent delete */
servicesRouter.post("/:id/restore", (c) => {
  return respondApiResult(c, restoreDeletedService(c.req.param("id")), 201);
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
