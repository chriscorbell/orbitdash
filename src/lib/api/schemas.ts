import * as z from "zod/mini";
import { DEFAULT_DASHBOARD_SETTINGS } from "@shared/dashboard-settings";

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
  // Defaulted so a services response cached by the offline worker before status checks existed
  // still loads (with checks off).
  check_enabled: z._default(z.boolean(), false),
  check_method: z._default(z.enum(["http", "tcp"]), "http"),
  check_target: z._default(z.nullable(z.string()), null),
  check_interval: z._default(z.number(), 60),
  check_ignore_tls: z._default(z.boolean(), false),
});

export const servicesResponseSchema = z.array(serviceSchema);

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
  created_at: z.number(),
  updated_at: z.number(),
});

export const categoriesResponseSchema = z.object({ categories: z.array(categorySchema) });

export const successResponseSchema = z.object({ success: z.literal(true) });

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
  showStatsPage: z.boolean(),
});

const appearanceSchema = z.object({
  accent: z.enum(["ice", "mint", "amber", "rose", "violet", "graphite"]),
  theme: z.enum(["dark", "light", "system"]),
  title: z.string(),
  wallpaper: z.nullable(z.string()),
  wallpaperBlur: z.number(),
  wallpaperDim: z.number(),
  customCss: z.string(),
});

export const wallpaperUploadSchema = z.object({ filename: z.string() });

const searchSchema = z.object({
  engine: z.enum(["duckduckgo", "google", "bing", "brave", "custom"]),
  customUrl: z.string(),
});

const widgetsSchema = z.object({
  placement: z.enum(["row", "header"]),
  clock: z.boolean(),
  greeting: z.boolean(),
  clockFormat: z.enum(["auto", "12h", "24h"]),
  weather: z.boolean(),
  weatherLocation: z.nullable(
    z.object({ name: z.string(), latitude: z.number(), longitude: z.number() })
  ),
  weatherUnits: z.enum(["metric", "imperial"]),
  agenda: z.boolean(),
  agendaDays: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14)]),
});

const settingsSchema = z.object({
  appearance: appearanceSchema,
  layout: layoutSchema,
  search: searchSchema,
  // Settings cached by the offline worker before widgets existed still load.
  widgets: z._default(widgetsSchema, () => ({ ...DEFAULT_DASHBOARD_SETTINGS.widgets })),
});

export const dashboardSettingsResponseSchema = z.object({
  device: z.nullable(
    z.object({
      id: z.string(),
      name: z.nullable(z.string()),
      overrides: z.object({
        appearance: z.optional(z.partial(appearanceSchema)),
        layout: z.optional(z.partial(layoutSchema)),
        search: z.optional(z.partial(searchSchema)),
        widgets: z.optional(z.partial(widgetsSchema)),
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
