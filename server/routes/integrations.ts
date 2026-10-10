import { Hono } from "hono";
import { integrationSaveSchema, integrationTestSchema } from "@shared/integration-schemas";
import type { IntegrationType } from "@shared/types";
import { normalizeServiceUrl } from "@shared/urls";
import { jsonError } from "../api-response";
import { ADAPTERS } from "../integrations/adapters";
import { integrationPoller } from "../integrations/poller-instance";
import { readIntegration } from "../integrations/poller";
import {
  deleteIntegration,
  getIntegration,
  IntegrationInputError,
  prepareIntegration,
  saveIntegration,
  toAdapterConfig,
} from "../integrations/store";
import { readValidatedJson } from "../request-body";
import { listServices } from "../services/service-operations";

const integrationsRouter = new Hono();

const serviceExists = (id: string) => listServices().some((service) => service.id === id);

/** GET /api/integrations/types — the apps orbitdash can read and what each needs */
integrationsRouter.get("/types", (c) => {
  const types: IntegrationType[] = ADAPTERS.map(({ id, name, icon, fields }) => ({
    id,
    name,
    icon,
    fields,
  }));
  return c.json({ types });
});

/** GET /api/integrations/data — the latest figures per service; new ones arrive as events */
integrationsRouter.get("/data", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ readings: integrationPoller.readings() });
});

/** GET /api/integrations/services/:id — a service's integration, secrets only marked as set */
integrationsRouter.get("/services/:id", (c) =>
  c.json({ integration: getIntegration(c.req.param("id")) })
);

integrationsRouter.put("/services/:id", async (c) => {
  const id = c.req.param("id");
  if (!serviceExists(id)) return jsonError(c, 404, "not found");
  const body = await readValidatedJson(c, integrationSaveSchema);
  if (body.response) return body.response;
  try {
    const { stored } = prepareIntegration(id, body.data.type, body.data.values);
    const integration = saveIntegration(id, stored);
    void integrationPoller.refresh();
    return c.json({ integration });
  } catch (error) {
    if (error instanceof IntegrationInputError) return jsonError(c, 400, error.message);
    throw error;
  }
});

integrationsRouter.delete("/services/:id", (c) => {
  const id = c.req.param("id");
  integrationPoller.forget(id);
  return deleteIntegration(id) ? c.json({ success: true }) : jsonError(c, 404, "not found");
});

/** POST /api/integrations/test — reads the app once with the form's values, nothing is saved */
integrationsRouter.post("/test", async (c) => {
  const body = await readValidatedJson(c, integrationTestSchema);
  if (body.response) return body.response;
  const serviceUrl = normalizeServiceUrl(body.data.url);
  if (!serviceUrl) return jsonError(c, 400, "service url must be a valid URL");
  try {
    const { adapter, stored } = prepareIntegration(
      body.data.serviceId,
      body.data.type,
      body.data.values
    );
    return c.json(await readIntegration(adapter, toAdapterConfig(stored, serviceUrl)));
  } catch (error) {
    if (error instanceof IntegrationInputError) return jsonError(c, 400, error.message);
    throw error;
  }
});

export default integrationsRouter;
