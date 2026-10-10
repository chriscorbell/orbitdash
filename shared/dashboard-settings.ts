import { z } from "zod";

export const GRID_COLUMN_OPTIONS = [3, 4, 5] as const;
export type GridColumns = (typeof GRID_COLUMN_OPTIONS)[number];

export interface DashboardLayoutSettings {
  gridColumns: GridColumns;
  servicesFirst: boolean;
  showServices: boolean;
  showStats: boolean;
}

export interface DashboardSettings {
  layout: DashboardLayoutSettings;
}

export interface DashboardSettingsPatch {
  layout?: Partial<DashboardLayoutSettings>;
}

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  layout: {
    gridColumns: 4,
    servicesFirst: true,
    showServices: true,
    showStats: true,
  },
};

const gridColumnsSchema = z.union([z.literal(3), z.literal(4), z.literal(5)]);

// Stored settings are parsed leniently: a missing or invalid field falls back to its default
// instead of failing the whole document, so older and newer versions can share one database.
const storedLayoutSchema = z.object({
  gridColumns: gridColumnsSchema.catch(DEFAULT_DASHBOARD_SETTINGS.layout.gridColumns),
  servicesFirst: z.boolean().catch(DEFAULT_DASHBOARD_SETTINGS.layout.servicesFirst),
  showServices: z.boolean().catch(DEFAULT_DASHBOARD_SETTINGS.layout.showServices),
  showStats: z.boolean().catch(DEFAULT_DASHBOARD_SETTINGS.layout.showStats),
});

const storedSettingsSchema = z.object({
  layout: storedLayoutSchema.catch(DEFAULT_DASHBOARD_SETTINGS.layout),
});

/** Request bodies are strict, so typos are reported instead of silently ignored. */
export const dashboardSettingsPatchSchema = z
  .object({
    layout: z
      .object({
        gridColumns: gridColumnsSchema.optional(),
        servicesFirst: z.boolean().optional(),
        showServices: z.boolean().optional(),
        showStats: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const dashboardSettingsSchema = z.object({
  layout: z.object({
    gridColumns: gridColumnsSchema,
    servicesFirst: z.boolean(),
    showServices: z.boolean(),
    showStats: z.boolean(),
  }),
});

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export const deviceIdSchema = z.string().regex(DEVICE_ID_PATTERN, "invalid device id");

export const deviceUpdateSchema = z
  .object({
    name: z.string().trim().max(60, "name must be 60 characters or fewer").nullable().optional(),
    overrides: dashboardSettingsPatchSchema.nullable().optional(),
  })
  .strict();

export const deviceSettingsSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  overrides: dashboardSettingsPatchSchema,
});

export const dashboardSettingsResponseSchema = z.object({
  device: deviceSettingsSchema.nullable(),
  effective: dashboardSettingsSchema,
  settings: dashboardSettingsSchema,
  stored: z.boolean(),
});

export type DeviceSettings = z.infer<typeof deviceSettingsSchema>;
export type DeviceUpdate = z.infer<typeof deviceUpdateSchema>;
export type DashboardSettingsResponse = z.infer<typeof dashboardSettingsResponseSchema>;

export function isDeviceId(value: string): boolean {
  return DEVICE_ID_PATTERN.test(value);
}

export function parseDashboardSettings(input: unknown): DashboardSettings {
  const parsed = storedSettingsSchema.safeParse(input);
  return parsed.success ? parsed.data : DEFAULT_DASHBOARD_SETTINGS;
}

/** Overrides read from storage keep only valid fields. */
export function parseDashboardSettingsPatch(input: unknown): DashboardSettingsPatch {
  const parsed = dashboardSettingsPatchSchema.safeParse(input);
  return parsed.success ? parsed.data : {};
}

export function mergeDashboardSettings(
  base: DashboardSettings,
  patch: DashboardSettingsPatch | null | undefined
): DashboardSettings {
  return { layout: { ...base.layout, ...patch?.layout } };
}

/** The fields of `next` that differ from `base`, or an empty patch when they match. */
export function diffDashboardSettings(
  base: DashboardSettings,
  next: DashboardSettings
): DashboardSettingsPatch {
  const layout: Partial<DashboardLayoutSettings> = {};
  for (const key of Object.keys(next.layout) as Array<keyof DashboardLayoutSettings>) {
    if (next.layout[key] !== base.layout[key]) {
      Object.assign(layout, { [key]: next.layout[key] });
    }
  }
  return Object.keys(layout).length > 0 ? { layout } : {};
}

export function isEmptySettingsPatch(patch: DashboardSettingsPatch | null | undefined): boolean {
  return !patch?.layout || Object.keys(patch.layout).length === 0;
}
