import { z } from "zod";
import { sanitizeCategoryOrder, UNCATEGORIZED_CATEGORY } from "./category-order";
import { normalizeIconUrl, normalizeServiceUrl } from "./urls";

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function trimOptionalString(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  return trimString(value);
}

function trimNullableString(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  const trimmed = trimString(value);
  return trimmed === "" ? null : trimmed;
}

const requiredNameSchema = z.preprocess(trimString, z.string().min(1, "name is required"));

const optionalNameSchema = z.preprocess(
  trimOptionalString,
  z.string().min(1, "name is required").optional()
);

const createTextFieldSchema = z
  .preprocess(trimNullableString, z.string().nullable().optional())
  .transform((value) => value ?? null);

const updateTextFieldSchema = z.preprocess(trimNullableString, z.string().nullable().optional());

const requiredServiceUrlSchema = z
  .preprocess(
    trimString,
    z.string().refine((value) => normalizeServiceUrl(value) !== null, {
      message: "service url must be a valid URL",
    })
  )
  .transform((value) => normalizeServiceUrl(value)!);

const optionalServiceUrlSchema = z
  .preprocess(
    trimOptionalString,
    z
      .string()
      .refine((value) => normalizeServiceUrl(value) !== null, {
        message: "service url must be a valid URL",
      })
      .optional()
  )
  .transform((value) => (value === undefined ? undefined : normalizeServiceUrl(value)!));

const createIconUrlSchema = z
  .preprocess(
    trimNullableString,
    z
      .string()
      .nullable()
      .optional()
      .refine(
        (value) => {
          return value === undefined || value === null || normalizeIconUrl(value) !== null;
        },
        {
          message: "icon url must be a valid http(s) URL",
        }
      )
  )
  .transform((value) => {
    if (value === undefined || value === null) {
      return null;
    }

    return normalizeIconUrl(value)!;
  });

const updateIconUrlSchema = z
  .preprocess(
    trimNullableString,
    z
      .string()
      .nullable()
      .optional()
      .refine(
        (value) => {
          return value === undefined || value === null || normalizeIconUrl(value) !== null;
        },
        {
          message: "icon url must be a valid http(s) URL",
        }
      )
  )
  .transform((value) => {
    if (value === undefined || value === null) {
      return value;
    }

    return normalizeIconUrl(value)!;
  });

export const metricSampleSchema = z.object({
  ts: z.number(),
  cpu: z.number(),
  ram: z.number(),
  disk: z.number(),
});

export const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  category: z.string().nullable(),
  open_in_new_tab: z.boolean(),
  created_at: z.number(),
  updated_at: z.number(),
});

export const servicesResponseSchema = z.array(serviceSchema);

export const metricsResponseSchema = z.object({
  samples: z.array(metricSampleSchema),
});

export const categoryOrderResponseSchema = z.object({
  order: z.array(z.string()),
});

export const serviceCreateSchema = z.object({
  name: requiredNameSchema,
  url: requiredServiceUrlSchema,
  description: createTextFieldSchema,
  icon_url: createIconUrlSchema,
  category: createTextFieldSchema,
  open_in_new_tab: z.boolean().optional().default(true),
});

export const serviceUpdateSchema = z.object({
  name: optionalNameSchema,
  url: optionalServiceUrlSchema,
  description: updateTextFieldSchema,
  icon_url: updateIconUrlSchema,
  category: updateTextFieldSchema,
  open_in_new_tab: z.boolean().optional(),
});

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

export const metricsQuerySchema = z.object({
  window: z.coerce
    .number({
      error: "window must be a positive integer",
    })
    .int("window must be a positive integer")
    .positive("window must be a positive integer")
    .max(3600, "window must be 3600 seconds or less")
    .default(30),
});

export function getValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "invalid request";
}

export type CategoryOrderUpdateInput = z.infer<typeof categoryOrderUpdateSchema>;
export type MetricsQueryInput = z.infer<typeof metricsQuerySchema>;
export type MetricSampleInput = z.infer<typeof metricSampleSchema>;
export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;
