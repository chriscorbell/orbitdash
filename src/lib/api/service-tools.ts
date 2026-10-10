import { jsonBody, requestJson } from "@/lib/api/client";
import * as z from "zod/mini";
import type { ServiceInspection, ServiceTestResult, StatusCheckMethod } from "@shared/types";

// Only the lazily loaded service dialog uses these.
export const serviceInspectionSchema = z.object({
  url: z.string(),
  reachable: z.boolean(),
  error: z.nullable(z.string()),
  name: z.nullable(z.string()),
  iconUrl: z.nullable(z.string()),
  selfSigned: z.boolean(),
});

export const serviceTestResultSchema = z.object({
  target: z.string(),
  state: z.enum(["up", "degraded", "down"]),
  latencyMs: z.nullable(z.number()),
  statusCode: z.nullable(z.number()),
  error: z.nullable(z.string()),
});

/** What the link's page says about itself: a name and an icon to fill in the form. */
export function inspectServiceUrl(url: string): Promise<ServiceInspection> {
  return requestJson(
    "/api/service-tools/inspect",
    jsonBody("POST", { url }),
    "Couldn't read that page",
    serviceInspectionSchema
  );
}

export interface ServiceTestInput {
  url: string;
  check_method: StatusCheckMethod;
  check_target: string | null;
  check_ignore_tls: boolean;
}

/** One status check with the form's settings, run now. */
export function testService(input: ServiceTestInput): Promise<ServiceTestResult> {
  return requestJson(
    "/api/service-tools/test",
    jsonBody("POST", input),
    "Couldn't run the test",
    serviceTestResultSchema
  );
}
