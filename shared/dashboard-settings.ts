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

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export interface DeviceSettings {
  id: string;
  name: string | null;
  overrides: DashboardSettingsPatch;
}

export interface DeviceUpdate {
  name?: string | null;
  overrides?: DashboardSettingsPatch | null;
}

export interface DashboardSettingsResponse {
  device: DeviceSettings | null;
  effective: DashboardSettings;
  settings: DashboardSettings;
  stored: boolean;
}

function isGridColumns(value: unknown): value is GridColumns {
  return (GRID_COLUMN_OPTIONS as readonly unknown[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Valid layout fields from untrusted input; anything else is left out. */
function pickLayoutFields(input: unknown): Partial<DashboardLayoutSettings> {
  if (!isRecord(input)) return {};
  const layout: Partial<DashboardLayoutSettings> = {};
  if (isGridColumns(input.gridColumns)) layout.gridColumns = input.gridColumns;
  for (const key of ["servicesFirst", "showServices", "showStats"] as const) {
    if (typeof input[key] === "boolean") layout[key] = input[key];
  }
  return layout;
}

export function isDeviceId(value: string): boolean {
  return DEVICE_ID_PATTERN.test(value);
}

/**
 * Stored settings are read leniently: a missing or invalid field falls back to its default
 * instead of failing the whole document, so older and newer versions can share one database.
 */
export function parseDashboardSettings(input: unknown): DashboardSettings {
  return mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, {
    layout: pickLayoutFields(isRecord(input) ? input.layout : undefined),
  });
}

/** Overrides read from storage keep only valid fields. */
export function parseDashboardSettingsPatch(input: unknown): DashboardSettingsPatch {
  const layout = pickLayoutFields(isRecord(input) ? input.layout : undefined);
  return Object.keys(layout).length > 0 ? { layout } : {};
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
