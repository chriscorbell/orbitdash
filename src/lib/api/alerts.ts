import * as z from "zod/mini";
import { jsonBody, requestJson } from "@/lib/api/client";
import { eventStream } from "@/lib/live/event-stream";
import type { AlertRule, AlertsResponse, MetricAlert } from "@shared/types";

const metricSchema = z.enum(["cpu", "memory", "disk", "temperature"]);

export const metricAlertSchema = z.object({
  id: z.string(),
  metric: metricSchema,
  subject: z.nullable(z.string()),
  threshold: z.number(),
  durationSec: z.number(),
  value: z.number(),
  peak: z.number(),
  startedAt: z.number(),
  firedAt: z.number(),
  resolvedAt: z.nullable(z.number()),
});

const alertRuleSchema = z.object({
  metric: metricSchema,
  enabled: z.boolean(),
  threshold: z.number(),
  durationSec: z.number(),
});

export const alertsResponseSchema = z.object({
  active: z.array(metricAlertSchema),
  recent: z.array(metricAlertSchema),
  rules: z.array(alertRuleSchema),
});

const alertRulesResponseSchema = z.object({ rules: z.array(alertRuleSchema) });

export function fetchAlerts(): Promise<AlertsResponse> {
  return requestJson("/api/alerts", {}, "Failed to load alerts", alertsResponseSchema);
}

export async function updateAlertRules(rules: AlertRule[]): Promise<AlertRule[]> {
  const response = await requestJson(
    "/api/alerts/rules",
    jsonBody("PUT", { rules }),
    "Failed to save alert rules",
    alertRulesResponseSchema
  );
  return response.rules;
}

/** Alerts as they fire and resolve, over the shared event stream. Returns a cleanup function. */
export function subscribeAlerts(onAlert: (alert: MetricAlert) => void): () => void {
  return eventStream.subscribe("alerts", (event) => {
    const parsed = metricAlertSchema.safeParse(event.alert);
    if (parsed.success) onAlert(parsed.data);
  });
}
