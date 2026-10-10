import * as z from "zod/mini";
import { requestJson } from "@/lib/api/client";
import type { ServiceStatus, StatusHistory, StatusHistoryRange } from "@shared/types";

/**
 * Status responses, parsed with zod/mini like the rest in schemas.ts. They live here rather than
 * in schemas.ts so they load with the lazy status chunk instead of the first paint; the same test
 * keeps them in agreement with the full-zod versions in shared/status-schemas.ts.
 */

const nullableNumber = z.nullable(z.number());

export const serviceStatusSchema = z.object({
  id: z.string(),
  state: z.enum(["up", "degraded", "down", "unknown"]),
  latencyMs: nullableNumber,
  statusCode: nullableNumber,
  error: z.nullable(z.string()),
  checkedAt: nullableNumber,
  changedAt: nullableNumber,
});

export const serviceStatusesResponseSchema = z.object({
  statuses: z.array(serviceStatusSchema),
});

export const statusHistorySchema = z.object({
  id: z.string(),
  range: z.enum(["24h", "30d"]),
  resolutionMs: z.number(),
  from: z.number(),
  to: z.number(),
  uptime: nullableNumber,
  buckets: z.array(
    z.object({
      ts: z.number(),
      checks: z.number(),
      failures: z.number(),
      slow: z.number(),
      latencyMs: nullableNumber,
    })
  ),
});

export async function fetchStatuses(): Promise<ServiceStatus[]> {
  const response = await requestJson(
    "/api/status",
    {},
    "Failed to load statuses",
    serviceStatusesResponseSchema
  );
  return response.statuses;
}

export function fetchStatusHistory(
  id: string,
  range: StatusHistoryRange = "24h"
): Promise<StatusHistory> {
  return requestJson(
    `/api/status/${encodeURIComponent(id)}/history?range=${range}`,
    {},
    "Failed to load status history",
    statusHistorySchema
  );
}
