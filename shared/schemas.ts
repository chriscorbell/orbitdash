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
  icon_source_url: z.string().nullable(),
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

export const snapshotSchema = z.object({
  createdAt: z.string(),
  name: z.string(),
  reason: z.enum(["manual", "nightly", "pre-import", "pre-migration"]),
  sizeBytes: z.number(),
});

export const snapshotsResponseSchema = z.object({
  snapshots: z.array(snapshotSchema),
});

export const importSummarySchema = z.object({
  icons: z.number(),
  services: z.number(),
  snapshot: z.string(),
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export type ImportSummary = z.infer<typeof importSummarySchema>;
