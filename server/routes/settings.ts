import { Hono, type Context } from "hono";
import { isDeviceId } from "@shared/dashboard-settings";
import { dashboardSettingsPatchSchema, deviceUpdateSchema } from "@shared/dashboard-settings-schemas";
import { jsonError, jsonNotFound } from "../api-response";
import { parseJsonBody, readValidatedJson } from "../request-body";
import {
  deleteDevice,
  getSettingsView,
  listDevices,
  updateDevice,
  updateGlobalSettings,
} from "../services/dashboard-settings-store";
import { readCategoryOrder, writeCategoryOrder } from "../services/category-order-store";
import { categoryOrderUpdateSchema, getValidationMessage } from "@shared/server-schemas";
import type { CategoryOrderResponse } from "@shared/types";

const settingsRouter = new Hono();

function readDeviceQuery(c: Context): string | null {
  const device = c.req.query("device");
  return device && isDeviceId(device) ? device : null;
}

/** GET /api/settings?device=<id> — shared settings, this device's overrides, and the result */
settingsRouter.get("/", (c) => c.json(getSettingsView(readDeviceQuery(c))));

/** PUT /api/settings?device=<id> — patches the shared settings */
settingsRouter.put("/", async (c) => {
  const body = await readValidatedJson(c, dashboardSettingsPatchSchema);
  if (body.response) return body.response;

  updateGlobalSettings(body.data);
  return c.json(getSettingsView(readDeviceQuery(c)));
});

/** GET /api/settings/devices — devices that have a name or their own overrides */
settingsRouter.get("/devices", (c) => c.json({ devices: listDevices() }));

/** PUT /api/settings/devices/:id — { name?, overrides? }; overrides null follows shared again */
settingsRouter.put("/devices/:id", async (c) => {
  const id = c.req.param("id");
  if (!isDeviceId(id)) {
    return jsonError(c, 400, "invalid device id");
  }

  const body = await readValidatedJson(c, deviceUpdateSchema);
  if (body.response) return body.response;

  updateDevice(id, body.data);
  return c.json(getSettingsView(id));
});

/** DELETE /api/settings/devices/:id */
settingsRouter.delete("/devices/:id", (c) => {
  return deleteDevice(c.req.param("id")) ? c.json({ success: true }) : jsonNotFound(c);
});

settingsRouter.get("/category-order", (c) => {
  const response: CategoryOrderResponse = {
    order: readCategoryOrder(),
  };

  return c.json(response);
});

settingsRouter.put("/category-order", async (c) => {
  const parsedBody = await parseJsonBody(c.req.raw);
  if (!parsedBody.success) {
    return jsonError(c, parsedBody.status ?? 400, parsedBody.error ?? "invalid request body");
  }

  const result = categoryOrderUpdateSchema.safeParse(parsedBody.data);

  if (!result.success) {
    return jsonError(c, 400, getValidationMessage(result.error));
  }

  // The schema's transform already ran sanitizeCategoryOrder
  const response: CategoryOrderResponse = {
    order: writeCategoryOrder(result.data.order),
  };

  return c.json(response);
});

export default settingsRouter;
