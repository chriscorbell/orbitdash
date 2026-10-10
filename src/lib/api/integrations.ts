import { jsonBody, request, requestJson } from "@/lib/api/client";
import { eventStream } from "@/lib/live/event-stream";
import { recordOf } from "@/lib/api/record-parser";
import * as z from "zod/mini";
import type { IntegrationReading, IntegrationType, ServiceIntegration } from "@shared/types";

// Only the lazily loaded integration layer and the service dialog use these.
export const integrationTypesSchema = z.object({
  types: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      icon: z.string(),
      fields: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          kind: z.enum(["url", "text", "secret", "toggle"]),
          required: z.boolean(),
          placeholder: z.optional(z.string()),
          help: z.optional(z.string()),
        })
      ),
    })
  ),
});

const valuesSchema = recordOf(z.union([z.string(), z.boolean()]));
const integrationShape = z.object({ type: z.string(), secretsSet: z.array(z.string()) });

/** { integration: { type, values, secretsSet } | null } */
export const serviceIntegrationSchema = recordParser((data) => {
  const integration = (data as { integration?: unknown } | null)?.integration;
  if (integration === null) return { integration: null };
  const { type, secretsSet } = integrationShape.parse(integration);
  return {
    integration: {
      type,
      values: valuesSchema.parse((integration as { values?: unknown }).values),
      secretsSet,
    },
  };
});

export const integrationReadingSchema = z.object({
  type: z.string(),
  stats: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      tone: z.optional(z.enum(["good", "warning", "bad"])),
    })
  ),
  error: z.nullable(z.string()),
  updatedAt: z.number(),
});

const readingsSchema = recordOf(integrationReadingSchema);

/** { readings: { [serviceId]: reading } } */
export const integrationReadingsSchema = recordParser((data) => ({
  readings: readingsSchema.parse((data as { readings?: unknown } | null)?.readings),
}));

function recordParser<T>(parse: (data: unknown) => T) {
  return {
    parse(data: unknown): T {
      if (typeof data !== "object" || data === null) throw new Error("Expected an object");
      return parse(data);
    },
    safeParse(data: unknown) {
      try {
        this.parse(data);
        return { success: true };
      } catch {
        return { success: false };
      }
    },
  };
}

export type IntegrationValues = Record<string, string | boolean | null>;

export async function fetchIntegrationTypes(): Promise<IntegrationType[]> {
  const response = await requestJson(
    "/api/integrations/types",
    {},
    "Couldn't load integrations",
    integrationTypesSchema
  );
  return response.types;
}

export async function fetchServiceIntegration(id: string): Promise<ServiceIntegration | null> {
  const response = await requestJson(
    `/api/integrations/services/${encodeURIComponent(id)}`,
    {},
    "Couldn't load the integration",
    serviceIntegrationSchema
  );
  return response.integration;
}

export async function saveServiceIntegration(
  id: string,
  input: { type: string; values: IntegrationValues }
): Promise<ServiceIntegration | null> {
  const response = await requestJson(
    `/api/integrations/services/${encodeURIComponent(id)}`,
    jsonBody("PUT", input),
    "Couldn't save the integration",
    serviceIntegrationSchema
  );
  return response.integration;
}

export async function deleteServiceIntegration(id: string): Promise<void> {
  await request(
    `/api/integrations/services/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    "Couldn't remove the integration"
  );
}

export function testIntegration(input: {
  serviceId: string | null;
  url: string;
  type: string;
  values: IntegrationValues;
}): Promise<IntegrationReading> {
  return requestJson(
    "/api/integrations/test",
    jsonBody("POST", input),
    "Couldn't run the test",
    integrationReadingSchema
  );
}

export async function fetchIntegrationReadings(): Promise<Record<string, IntegrationReading>> {
  const response = await requestJson(
    "/api/integrations/data",
    {},
    "Couldn't load integration figures",
    integrationReadingsSchema
  );
  return response.readings;
}

export function subscribeIntegrations(
  listener: (serviceId: string, reading: IntegrationReading) => void
): () => void {
  return eventStream.subscribe("integrations", (event) => listener(event.serviceId, event.reading));
}
