export const GRID_COLUMN_OPTIONS = [3, 4, 5] as const;
export type GridColumns = (typeof GRID_COLUMN_OPTIONS)[number];

export const THEME_OPTIONS = ["dark", "light", "system"] as const;
export type ThemePreference = (typeof THEME_OPTIONS)[number];

export const ACCENT_OPTIONS = ["ice", "mint", "amber", "rose", "violet", "graphite"] as const;
export type AccentPreset = (typeof ACCENT_OPTIONS)[number];

export interface DashboardLayoutSettings {
  gridColumns: GridColumns;
  servicesFirst: boolean;
  showServices: boolean;
  showStats: boolean;
}

export interface DashboardAppearanceSettings {
  accent: AccentPreset;
  theme: ThemePreference;
}

export interface DashboardSettings {
  appearance: DashboardAppearanceSettings;
  layout: DashboardLayoutSettings;
}

export type DashboardSettingsPatch = {
  [Section in keyof DashboardSettings]?: Partial<DashboardSettings[Section]>;
};

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  appearance: {
    accent: "ice",
    theme: "dark",
  },
  layout: {
    gridColumns: 4,
    servicesFirst: true,
    showServices: true,
    showStats: true,
  },
};

type Validator = (value: unknown) => boolean;

const oneOf =
  (options: readonly unknown[]): Validator =>
  (value) =>
    options.includes(value);
const isBoolean: Validator = (value) => typeof value === "boolean";

/** Which values each field accepts; anything else falls back to the default when read. */
const FIELD_VALIDATORS: {
  [Section in keyof DashboardSettings]: Record<keyof DashboardSettings[Section], Validator>;
} = {
  appearance: {
    accent: oneOf(ACCENT_OPTIONS),
    theme: oneOf(THEME_OPTIONS),
  },
  layout: {
    gridColumns: oneOf(GRID_COLUMN_OPTIONS),
    servicesFirst: isBoolean,
    showServices: isBoolean,
    showStats: isBoolean,
  },
};

const SECTIONS = Object.keys(FIELD_VALIDATORS) as Array<keyof DashboardSettings>;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Valid fields of one section from untrusted input; anything else is left out. */
function pickSectionFields(
  section: keyof DashboardSettings,
  input: unknown
): Record<string, unknown> {
  if (!isRecord(input)) return {};
  const picked: Record<string, unknown> = {};
  for (const [field, isValid] of Object.entries(FIELD_VALIDATORS[section])) {
    if (isValid(input[field])) picked[field] = input[field];
  }
  return picked;
}

export function isDeviceId(value: string): boolean {
  return DEVICE_ID_PATTERN.test(value);
}

/** Overrides read from storage keep only valid fields; empty sections are dropped. */
export function parseDashboardSettingsPatch(input: unknown): DashboardSettingsPatch {
  const patch: Record<string, unknown> = {};
  for (const section of SECTIONS) {
    const fields = pickSectionFields(section, isRecord(input) ? input[section] : undefined);
    if (Object.keys(fields).length > 0) patch[section] = fields;
  }
  return patch as DashboardSettingsPatch;
}

/**
 * Stored settings are read leniently: a missing or invalid field falls back to its default
 * instead of failing the whole document, so older and newer versions can share one database.
 */
export function parseDashboardSettings(input: unknown): DashboardSettings {
  return mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, parseDashboardSettingsPatch(input));
}

export function mergeDashboardSettings(
  base: DashboardSettings,
  patch: DashboardSettingsPatch | null | undefined
): DashboardSettings {
  return {
    appearance: { ...base.appearance, ...patch?.appearance },
    layout: { ...base.layout, ...patch?.layout },
  };
}

/** The fields of `next` that differ from `base`, or an empty patch when they match. */
export function diffDashboardSettings(
  base: DashboardSettings,
  next: DashboardSettings
): DashboardSettingsPatch {
  const patch: Record<string, Record<string, unknown>> = {};
  for (const section of SECTIONS) {
    const baseSection = base[section] as unknown as Record<string, unknown>;
    const nextSection = next[section] as unknown as Record<string, unknown>;
    for (const field of Object.keys(nextSection)) {
      if (nextSection[field] !== baseSection[field]) {
        patch[section] = { ...patch[section], [field]: nextSection[field] };
      }
    }
  }
  return patch as DashboardSettingsPatch;
}

/** Overlays one patch on another, field by field. */
export function mergeSettingsPatches(
  base: DashboardSettingsPatch,
  next: DashboardSettingsPatch
): DashboardSettingsPatch {
  const merged: Record<string, unknown> = {};
  for (const section of SECTIONS) {
    const fields = { ...base[section], ...next[section] };
    if (Object.keys(fields).length > 0) merged[section] = fields;
  }
  return merged as DashboardSettingsPatch;
}

export function isEmptySettingsPatch(patch: DashboardSettingsPatch | null | undefined): boolean {
  return !patch || SECTIONS.every((section) => Object.keys(patch[section] ?? {}).length === 0);
}
