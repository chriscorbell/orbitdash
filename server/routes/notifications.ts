import { Hono } from "hono";
import {
  notificationChannelCreateSchema,
  notificationChannelUpdateSchema,
  notificationOptionsSchema,
} from "@shared/notification-schemas";
import { getValidationMessage } from "@shared/service-schemas";
import { jsonError, jsonNotFound, respondApiResult } from "../api-response";
import { notifications } from "../notifications/service";
import { parseJsonBody, readValidatedJson } from "../request-body";

const notificationsRouter = new Hono();

/** GET /api/notifications — channels with secrets masked, options, and recent deliveries */
notificationsRouter.get("/", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(notifications.read());
});

/** POST /api/notifications/channels — a new channel, with every secret */
notificationsRouter.post("/channels", async (c) => {
  const body = await readValidatedJson(c, notificationChannelCreateSchema);
  if (body.response) return body.response;
  const result = notifications.createChannel(body.data);
  return result.success ? c.json({ channel: result.value }, 201) : respondApiResult(c, result);
});

/** PUT /api/notifications/channels/:id — secrets left out (or sent back masked) are kept */
notificationsRouter.put("/channels/:id", async (c) => {
  const body = await readValidatedJson(c, notificationChannelUpdateSchema);
  if (body.response) return body.response;
  const result = notifications.updateChannel(c.req.param("id"), body.data);
  return result.success ? c.json({ channel: result.value }) : respondApiResult(c, result);
});

/** DELETE /api/notifications/channels/:id */
notificationsRouter.delete("/channels/:id", (c) =>
  notifications.deleteChannel(c.req.param("id")) ? c.json({ success: true }) : jsonNotFound(c)
);

/**
 * POST /api/notifications/channels/:id/test — sends a test message. An optional body (the same
 * shape as an update) tests unsaved edits without saving them.
 */
notificationsRouter.post("/channels/:id/test", async (c) => {
  let draft;
  if (c.req.header("content-type")) {
    const parsed = await parseJsonBody(c.req.raw);
    if (!parsed.success) return jsonError(c, parsed.status ?? 400, parsed.error ?? "invalid body");
    const result = notificationChannelUpdateSchema.safeParse(parsed.data);
    if (!result.success) return jsonError(c, 400, getValidationMessage(result.error));
    draft = result.data;
  }
  return respondApiResult(c, await notifications.testChannel(c.req.param("id"), draft));
});

/** POST /api/notifications/test — sends a test message to a channel that isn't saved yet */
notificationsRouter.post("/test", async (c) => {
  const body = await readValidatedJson(c, notificationChannelCreateSchema);
  if (body.response) return body.response;
  return c.json(await notifications.testDraft(body.data));
});

/** PUT /api/notifications/options — the down delay, quiet hours and time zone */
notificationsRouter.put("/options", async (c) => {
  const body = await readValidatedJson(c, notificationOptionsSchema);
  if (body.response) return body.response;
  return c.json({ options: notifications.updateOptions(body.data) });
});

export default notificationsRouter;
