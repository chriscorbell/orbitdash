import { z } from "zod";

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

export const renameCategoryResponseSchema = z.object({
  services: servicesResponseSchema,
  order: z.array(z.string()),
});

export type MetricSampleInput = z.infer<typeof metricSampleSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
