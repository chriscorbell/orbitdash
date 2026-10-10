import * as z from "zod/mini";

/**
 * Response shapes parsed in the browser. These mirror the full-zod schemas in shared/ but use
 * zod/mini, which tree-shakes to a few kilobytes, so full zod stays out of the first paint and
 * only loads with the service form. A test keeps both versions in agreement.
 */

export const metricSampleSchema = z.object({
  ts: z.number(),
  cpu: z.number(),
  ram: z.number(),
  disk: z.number(),
});

export const metricsResponseSchema = z.object({ samples: z.array(metricSampleSchema) });

export const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  description: z.nullable(z.string()),
  icon: z.nullable(z.string()),
  icon_source_url: z.nullable(z.string()),
  category: z.nullable(z.string()),
  category_id: z.nullable(z.string()),
  position: z.number(),
  open_in_new_tab: z.boolean(),
  created_at: z.number(),
  updated_at: z.number(),
});

export const servicesResponseSchema = z.array(serviceSchema);

export const categoryOrderResponseSchema = z.object({ order: z.array(z.string()) });

export const renameCategoryResponseSchema = z.object({
  services: servicesResponseSchema,
  order: z.array(z.string()),
});

export const snapshotSchema = z.object({
  createdAt: z.string(),
  name: z.string(),
  reason: z.enum(["manual", "nightly", "pre-import", "pre-migration"]),
  sizeBytes: z.number(),
});

export const snapshotsResponseSchema = z.object({ snapshots: z.array(snapshotSchema) });

export const importSummarySchema = z.object({
  icons: z.number(),
  services: z.number(),
  snapshot: z.string(),
});

const gridColumnsSchema = z.union([z.literal(3), z.literal(4), z.literal(5)]);

const layoutSchema = z.object({
  gridColumns: gridColumnsSchema,
  servicesFirst: z.boolean(),
  showServices: z.boolean(),
  showStats: z.boolean(),
});

const appearanceSchema = z.object({
  accent: z.enum(["ice", "mint", "amber", "rose", "violet", "graphite"]),
  theme: z.enum(["dark", "light", "system"]),
});

const settingsSchema = z.object({ appearance: appearanceSchema, layout: layoutSchema });

export const dashboardSettingsResponseSchema = z.object({
  device: z.nullable(
    z.object({
      id: z.string(),
      name: z.nullable(z.string()),
      overrides: z.object({
        appearance: z.optional(z.partial(appearanceSchema)),
        layout: z.optional(z.partial(layoutSchema)),
      }),
    })
  ),
  effective: settingsSchema,
  settings: settingsSchema,
  stored: z.boolean(),
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export type ImportSummary = z.infer<typeof importSummarySchema>;
