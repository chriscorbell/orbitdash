import { z } from "zod";
import { STATUS_HISTORY_RANGES } from "./status";
import type { ServiceStatus, ServiceStatusesResponse, StatusHistory } from "./types";

const nullableNumber = z.number().nullable();

export const serviceStatusSchema = z.object({
  id: z.string(),
  state: z.enum(["up", "degraded", "down", "unknown"]),
  latencyMs: nullableNumber,
  statusCode: nullableNumber,
  error: z.string().nullable(),
  checkedAt: nullableNumber,
  changedAt: nullableNumber,
}) satisfies z.ZodType<ServiceStatus>;

export const serviceStatusesResponseSchema = z.object({
  statuses: z.array(serviceStatusSchema),
}) satisfies z.ZodType<ServiceStatusesResponse>;

export const statusHistorySchema = z.object({
  id: z.string(),
  range: z.enum(STATUS_HISTORY_RANGES),
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
}) satisfies z.ZodType<StatusHistory>;

export const statusHistoryQuerySchema = z.object({
  range: z
    .enum(STATUS_HISTORY_RANGES, {
      error: `range must be one of ${STATUS_HISTORY_RANGES.join(", ")}`,
    })
    .default("24h"),
});
