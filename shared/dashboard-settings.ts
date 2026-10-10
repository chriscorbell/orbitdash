export const BOARD_MODE_OPTIONS = ["columns", "rows"] as const;
export type BoardMode = (typeof BOARD_MODE_OPTIONS)[number];

export const CARD_DENSITY_OPTIONS = ["compact", "comfortable", "tiles"] as const;
export type CardDensity = (typeof CARD_DENSITY_OPTIONS)[number];

export const THEME_OPTIONS = ["dark", "light", "system"] as const;
export type ThemePreference = (typeof THEME_OPTIONS)[number];

export const STATS_POSITION_OPTIONS = ["top", "bottom"] as const;
export type StatsPosition = (typeof STATS_POSITION_OPTIONS)[number];

/**
 * Which URL a card opens when a service has an external one too: auto picks from the address this
 * dashboard was opened at, the others always pick the same one (a wall tablet on your network that
 * reaches the dashboard through its public name, say).
 */
export const LINK_PREFERENCE_OPTIONS = ["auto", "internal", "external"] as const;
export type LinkPreference = (typeof LINK_PREFERENCE_OPTIONS)[number];

export const ACCENT_OPTIONS = ["ice", "mint", "amber", "rose", "violet", "graphite"] as const;
export type AccentPreset = (typeof ACCENT_OPTIONS)[number];

/** Uploaded wallpapers are content-addressed: `wallpaper-<16 hex>.<ext>`. */
export const WALLPAPER_FILENAME_PATTERN = /^wallpaper-[a-f0-9]{16}\.(png|jpg|gif|webp|avif)$/;
export const WALLPAPER_BLUR_MAX = 32;
export const WALLPAPER_DIM_MAX = 90;
export const TITLE_MAX_LENGTH = 60;
export const CUSTOM_CSS_MAX_LENGTH = 20_000;

export const SEARCH_ENGINE_OPTIONS = ["duckduckgo", "google", "bing", "brave", "custom"] as const;
export type SearchEngine = (typeof SEARCH_ENGINE_OPTIONS)[number];
export const SEARCH_URL_MAX_LENGTH = 500;

export const WIDGET_PLACEMENT_OPTIONS = ["row", "header"] as const;
export type WidgetPlacement = (typeof WIDGET_PLACEMENT_OPTIONS)[number];

export const CLOCK_FORMAT_OPTIONS = ["auto", "12h", "24h"] as const;
export type ClockFormat = (typeof CLOCK_FORMAT_OPTIONS)[number];

export const WEATHER_UNIT_OPTIONS = ["metric", "imperial"] as const;
export type WeatherUnits = (typeof WEATHER_UNIT_OPTIONS)[number];

export const AGENDA_DAY_OPTIONS = [1, 3, 7, 14] as const;
export type AgendaDays = (typeof AGENDA_DAY_OPTIONS)[number];

export const WEATHER_LOCATION_NAME_MAX_LENGTH = 120;

/** A place picked from the geocoder; the name is only for display. */
export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface DashboardLayoutSettings {
  /** Categories side by side as columns, or stacked as rows of cards. */
  mode: BoardMode;
  density: CardDensity;
  statsPosition: StatsPosition;
  showServices: boolean;
  showStats: boolean;
  /** The Stats page and its tab in the header. */
  showStatsPage: boolean;
  linkPreference: LinkPreference;
}

export interface DashboardAppearanceSettings {
  accent: AccentPreset;
  theme: ThemePreference;
  /** Shown in the header and the browser tab; empty means "orbitdash". */
  title: string;
  /** Uploaded image filename, or null for none. */
  wallpaper: string | null;
  /** Wallpaper blur in pixels. */
  wallpaperBlur: number;
  /** How much the wallpaper is dimmed toward the background color, in percent. */
  wallpaperDim: number;
  /** Extra CSS applied after the app's own styles. */
  customCss: string;
}

export interface DashboardSearchSettings {
  /** Where the command palette sends a query that matches no service. */
  engine: SearchEngine;
  /** For "custom": an http(s) URL with %s where the query goes, e.g. a SearXNG instance. */
  customUrl: string;
}

export interface DashboardWidgetSettings {
  /** A row of widgets above the board, or compact pills in the header. */
  placement: WidgetPlacement;
  /** A clock with the date (row placement; the header always shows the time). */
  clock: boolean;
  /** "Good morning" above the clock. */
  greeting: boolean;
  /** Applies to the header clock and the greeting. */
  clockFormat: ClockFormat;
  weather: boolean;
  weatherLocation: WeatherLocation | null;
  weatherUnits: WeatherUnits;
  /** Upcoming events from the calendar feeds saved on the server. */
  agenda: boolean;
  agendaDays: AgendaDays;
}

export interface DashboardSettings {
  appearance: DashboardAppearanceSettings;
  layout: DashboardLayoutSettings;
  search: DashboardSearchSettings;
  widgets: DashboardWidgetSettings;
}

export type DashboardSettingsPatch = {
  [Section in keyof DashboardSettings]?: Partial<DashboardSettings[Section]>;
};

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  appearance: {
    accent: "ice",
    theme: "dark",
    title: "",
    wallpaper: null,
    wallpaperBlur: 0,
    wallpaperDim: 40,
    customCss: "",
  },
  layout: {
    mode: "columns",
    density: "comfortable",
    statsPosition: "top",
    showServices: true,
    showStats: true,
    showStatsPage: true,
    linkPreference: "auto",
  },
  search: {
    engine: "duckduckgo",
    customUrl: "",
  },
  widgets: {
    placement: "row",
    clock: false,
    greeting: false,
    clockFormat: "auto",
    weather: false,
    weatherLocation: null,
    weatherUnits: "metric",
    agenda: false,
    agendaDays: 7,
  },
};

type Validator = (value: unknown) => boolean;

const oneOf =
  (options: readonly unknown[]): Validator =>
  (value) =>
    options.includes(value);
const isBoolean: Validator = (value) => typeof value === "boolean";
const isIntegerBetween =
  (min: number, max: number): Validator =>
  (value) =>
    Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isStringUpTo =
  (maxLength: number): Validator =>
  (value) =>
    typeof value === "string" && value.length <= maxLength;
/** Empty, or an http(s) URL template with a %s placeholder for the query. */
export function isSearchUrlTemplate(value: unknown): boolean {
  if (typeof value !== "string" || value.length > SEARCH_URL_MAX_LENGTH) return false;
  if (value === "") return true;
  if (!value.includes("%s")) return false;
  try {
    const url = new URL(value.replace("%s", "query"));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const isNumberBetween = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function isWeatherLocation(value: unknown): value is WeatherLocation {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= WEATHER_LOCATION_NAME_MAX_LENGTH &&
    isNumberBetween(value.latitude, -90, 90) &&
    isNumberBetween(value.longitude, -180, 180)
  );
}

const isWallpaper: Validator = (value) =>
  value === null || (typeof value === "string" && WALLPAPER_FILENAME_PATTERN.test(value));

/** Which values each field accepts; anything else falls back to the default when read. */
const FIELD_VALIDATORS: {
  [Section in keyof DashboardSettings]: Record<keyof DashboardSettings[Section], Validator>;
} = {
  appearance: {
    accent: oneOf(ACCENT_OPTIONS),
    theme: oneOf(THEME_OPTIONS),
    title: isStringUpTo(TITLE_MAX_LENGTH),
    wallpaper: isWallpaper,
    wallpaperBlur: isIntegerBetween(0, WALLPAPER_BLUR_MAX),
    wallpaperDim: isIntegerBetween(0, WALLPAPER_DIM_MAX),
    customCss: isStringUpTo(CUSTOM_CSS_MAX_LENGTH),
  },
  layout: {
    mode: oneOf(BOARD_MODE_OPTIONS),
    density: oneOf(CARD_DENSITY_OPTIONS),
    statsPosition: oneOf(STATS_POSITION_OPTIONS),
    showServices: isBoolean,
    showStats: isBoolean,
    showStatsPage: isBoolean,
    linkPreference: oneOf(LINK_PREFERENCE_OPTIONS),
  },
  search: {
    engine: oneOf(SEARCH_ENGINE_OPTIONS),
    customUrl: isSearchUrlTemplate,
  },
  widgets: {
    placement: oneOf(WIDGET_PLACEMENT_OPTIONS),
    clock: isBoolean,
    greeting: isBoolean,
    clockFormat: oneOf(CLOCK_FORMAT_OPTIONS),
    weather: isBoolean,
    weatherLocation: (value) => value === null || isWeatherLocation(value),
    weatherUnits: oneOf(WEATHER_UNIT_OPTIONS),
    agenda: isBoolean,
    agendaDays: oneOf(AGENDA_DAY_OPTIONS),
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
    search: { ...base.search, ...patch?.search },
    widgets: { ...base.widgets, ...patch?.widgets },
  };
}

/** Field values are primitives or small plain objects (a weather location). */
function sameValue(a: unknown, b: unknown): boolean {
  return a === b || (isRecord(a) && isRecord(b) && JSON.stringify(a) === JSON.stringify(b));
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
      if (!sameValue(nextSection[field], baseSection[field])) {
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

/** Every wallpaper a stored settings document or device override points at. */
export function referencedWallpapers(documents: readonly unknown[]): Set<string> {
  const names = new Set<string>();
  for (const document of documents) {
    if (!isRecord(document)) continue;
    // A device document keeps its settings under `overrides`.
    const source = isRecord(document.overrides) ? document.overrides : document;
    const wallpaper = parseDashboardSettingsPatch(source).appearance?.wallpaper;
    if (wallpaper) names.add(wallpaper);
  }
  return names;
}

const SEARCH_URLS: Record<Exclude<SearchEngine, "custom">, string> = {
  bing: "https://www.bing.com/search?q=%s",
  brave: "https://search.brave.com/search?q=%s",
  duckduckgo: "https://duckduckgo.com/?q=%s",
  google: "https://www.google.com/search?q=%s",
};

/** The web search URL for a query, falling back to DuckDuckGo when a custom URL isn't set. */
export function buildSearchUrl(search: DashboardSearchSettings, query: string): string {
  const template =
    search.engine === "custom"
      ? search.customUrl || SEARCH_URLS.duckduckgo
      : SEARCH_URLS[search.engine];
  return template.replace("%s", encodeURIComponent(query.trim()));
}
