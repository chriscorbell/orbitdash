import { z } from "zod";
import { ALERT_DURATIONS_SEC, ALERT_METRICS, ALERT_THRESHOLD_RANGE } from "./alerts";

const metricSchema = z.enum(ALERT_METRICS as [string, ...string[]]);

export const alertRuleSchema = z
  .object({
    metric: metricSchema,
    enabled: z.boolean(),
    threshold: z.number(),
    durationSec: z.number().int(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const range = ALERT_THRESHOLD_RANGE[rule.metric as keyof typeof ALERT_THRESHOLD_RANGE];
    if (rule.threshold < range.min || rule.threshold > range.max) {
      ctx.addIssue({
        code: "custom",
        message: `${rule.metric} threshold must be between ${range.min} and ${range.max}`,
      });
    }
    if (!(ALERT_DURATIONS_SEC as readonly number[]).includes(rule.durationSec)) {
      ctx.addIssue({ code: "custom", message: "duration is not one of the allowed choices" });
    }
  });

/** PUT /api/alerts/rules body: any subset of rules, one per metric. */
export const alertRulesUpdateSchema = z
  .object({ rules: z.array(alertRuleSchema).max(ALERT_METRICS.length) })
  .strict()
  .refine(
    (body) => new Set(body.rules.map((rule) => rule.metric)).size === body.rules.length,
    "each metric can appear only once"
  );

const metricAlertSchema = z.object({
  id: z.string(),
  metric: metricSchema,
  subject: z.string().nullable(),
  threshold: z.number(),
  durationSec: z.number(),
  value: z.number(),
  peak: z.number(),
  startedAt: z.number(),
  firedAt: z.number(),
  resolvedAt: z.number().nullable(),
});

export const alertsResponseSchema = z.object({
  active: z.array(metricAlertSchema),
  recent: z.array(metricAlertSchema),
  rules: z.array(
    z.object({
      metric: metricSchema,
      enabled: z.boolean(),
      threshold: z.number(),
      durationSec: z.number(),
    })
  ),
});

export { metricAlertSchema };
