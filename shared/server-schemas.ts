import { z } from "zod";
import { getValidationMessage } from "./service-schemas";
import { sanitizeCategoryOrder, UNCATEGORIZED_CATEGORY } from "./category-order";

export const categoryOrderUpdateSchema = z
  .object({
    order: z.array(z.string()),
  })
  .superRefine(({ order }, ctx) => {
    if (order.some((value) => value.trim() === UNCATEGORIZED_CATEGORY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${UNCATEGORIZED_CATEGORY}" cannot be manually ordered`,
        path: ["order"],
      });
    }
  })
  .transform(({ order }) => ({
    order: sanitizeCategoryOrder(order),
  }));

/** Samples older than this are pruned, so larger query windows would return nothing extra. */
export const METRICS_RETENTION_SECONDS = 60;

export const metricsQuerySchema = z.object({
  window: z.coerce
    .number({
      error: "window must be a positive integer",
    })
    .int("window must be a positive integer")
    .positive("window must be a positive integer")
    .max(METRICS_RETENTION_SECONDS, `window must be ${METRICS_RETENTION_SECONDS} seconds or less`)
    .default(30),
});

export { getValidationMessage };

export type CategoryOrderUpdateInput = z.infer<typeof categoryOrderUpdateSchema>;
export type MetricsQueryInput = z.infer<typeof metricsQuerySchema>;
export type { ServiceUpdateInput } from "./service-schemas";
