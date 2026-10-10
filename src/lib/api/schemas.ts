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

const layoutSchema = z.object({
  mode: z.enum(["columns", "rows"]),
  density: z.enum(["compact", "comfortable", "tiles"]),
  statsPosition: z.enum(["top", "bottom"]),
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

export const systemInfoSchema = z.object({
  cpuCount: z.number(),
  cpuModel: z.nullable(z.string()),
  hostname: z.nullable(z.string()),
  kernel: z.nullable(z.string()),
  osName: z.nullable(z.string()),
  platform: z.string(),
  uptimeSeconds: z.number(),
});

export type SystemInfo = z.infer<typeof systemInfoSchema>;

const nullableNumber = z.nullable(z.number());

export const hostSnapshotSchema = z.object({
  version: z.literal(1),
  ts: z.number(),
  intervalMs: nullableNumber,
  cpu: z.object({
    usage: nullableNumber,
    cores: z.array(
      z.object({ id: z.number(), usage: nullableNumber, frequencyMhz: nullableNumber })
    ),
    load: z.nullable(z.object({ one: z.number(), five: z.number(), fifteen: z.number() })),
    frequencyMhz: nullableNumber,
    temperatureCelsius: nullableNumber,
  }),
  memory: z.nullable(
    z.object({
      totalBytes: z.number(),
      usedBytes: z.number(),
      availableBytes: z.number(),
      cachedBytes: nullableNumber,
      swapTotalBytes: nullableNumber,
      swapUsedBytes: nullableNumber,
    })
  ),
  temperatures: z.array(
    z.object({
      id: z.string(),
      chip: z.string(),
      label: z.nullable(z.string()),
      celsius: z.number(),
    })
  ),
  filesystems: z.array(
    z.object({
      mountpoint: z.string(),
      device: z.string(),
      type: z.string(),
      totalBytes: z.number(),
      usedBytes: z.number(),
      availableBytes: z.number(),
    })
  ),
  disks: z.array(
    z.object({
      name: z.string(),
      readBytesPerSec: nullableNumber,
      writeBytesPerSec: nullableNumber,
    })
  ),
  network: z.array(
    z.object({ name: z.string(), rxBytesPerSec: nullableNumber, txBytesPerSec: nullableNumber })
  ),
});

const historySeries = z.object({ avg: z.array(nullableNumber), max: z.array(nullableNumber) });

export const metricHistorySchema = z.object({
  range: z.enum(["1h", "24h", "7d", "30d"]),
  resolutionMs: z.number(),
  from: z.number(),
  to: z.number(),
  ts: z.array(z.number()),
  series: z.object({
    cpu: historySeries,
    memory: historySeries,
    disk: historySeries,
    load1: historySeries,
    temperature: historySeries,
    netRx: historySeries,
    netTx: historySeries,
    diskRead: historySeries,
    diskWrite: historySeries,
  }),
});
