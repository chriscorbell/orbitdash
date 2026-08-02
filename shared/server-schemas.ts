import { z } from "zod";
import { getValidationMessage } from "./service-schemas";
import { sanitizeCategoryOrder, UNCATEGORIZED_CATEGORY } from "./category-order";

const ORDER_TYPE_ERROR = "order must be an array of category names";

export const categoryOrderUpdateSchema = z
  .object({
    order: z.array(z.string({ error: ORDER_TYPE_ERROR }), { error: ORDER_TYPE_ERROR }),
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

export const categoryRenameSchema = z
  .object({
    from: z.string({ error: "from must be a string" }).trim().min(1, "from is required"),
    to: z.string({ error: "to must be a string" }).trim().min(1, "to is required"),
  })
  .superRefine(({ from, to }, ctx) => {
    if (from === UNCATEGORIZED_CATEGORY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `the ${UNCATEGORIZED_CATEGORY} group cannot be renamed`,
        path: ["from"],
      });
    }

    if (to === UNCATEGORIZED_CATEGORY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${UNCATEGORIZED_CATEGORY}" is a reserved category name`,
        path: ["to"],
      });
    }

    if (from !== UNCATEGORIZED_CATEGORY && from === to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "the new name must be different from the current name",
        path: ["to"],
      });
    }
  });

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
export type CategoryRenameInput = z.infer<typeof categoryRenameSchema>;
export type MetricsQueryInput = z.infer<typeof metricsQuerySchema>;
export type { ServiceUpdateInput } from "./service-schemas";
