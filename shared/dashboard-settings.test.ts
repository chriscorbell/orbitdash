import { describe, expect, it } from "vitest";
import {
  dashboardSettingsPatchSchema,
  dashboardSettingsResponseSchema,
  deviceIdSchema,
  deviceUpdateSchema,
} from "./dashboard-settings-schemas";
import {
  DEFAULT_DASHBOARD_SETTINGS,
  diffDashboardSettings,
  isDeviceId,
  isEmptySettingsPatch,
  mergeDashboardSettings,
  mergeSettingsPatches,
  parseDashboardSettings,
  parseDashboardSettingsPatch,
  referencedWallpapers,
  buildSearchUrl,
  isSearchUrlTemplate,
  isWeatherLocation,
} from "./dashboard-settings";

describe("parseDashboardSettings", () => {
  it("returns defaults for missing or unreadable documents", () => {
    expect(parseDashboardSettings(undefined)).toEqual(DEFAULT_DASHBOARD_SETTINGS);
    expect(parseDashboardSettings(null)).toEqual(DEFAULT_DASHBOARD_SETTINGS);
    expect(parseDashboardSettings("nope")).toEqual(DEFAULT_DASHBOARD_SETTINGS);
    expect(parseDashboardSettings({})).toEqual(DEFAULT_DASHBOARD_SETTINGS);
  });

  it("reads appearance and falls back for unknown themes and accents", () => {
    expect(
      parseDashboardSettings({ appearance: { theme: "light", accent: "teal" } }).appearance
    ).toEqual({ ...DEFAULT_DASHBOARD_SETTINGS.appearance, theme: "light", accent: "ice" });
  });

  it("keeps valid fields and replaces only the invalid ones", () => {
    expect(
      parseDashboardSettings({
        layout: {
          density: "huge",
          statsPosition: "bottom",
          showServices: "yes",
          servicesFirst: true,
        },
        future: { setting: true },
      })
    ).toEqual({
      ...DEFAULT_DASHBOARD_SETTINGS,
      layout: {
        mode: "columns",
        density: "comfortable",
        statsPosition: "bottom",
        showServices: true,
        showStats: true,
        showStatsPage: true,
      },
    });
  });

  it("falls back to default layout when the section is not an object", () => {
    expect(parseDashboardSettings({ layout: 3 })).toEqual(DEFAULT_DASHBOARD_SETTINGS);
  });
});

describe("patches", () => {
  it("accepts partial layout changes and rejects unknown or invalid fields", () => {
    expect(dashboardSettingsPatchSchema.parse({ layout: { density: "tiles" } })).toEqual({
      layout: { density: "tiles" },
    });
    expect(dashboardSettingsPatchSchema.parse({})).toEqual({});
    expect(dashboardSettingsPatchSchema.safeParse({ layout: { density: "huge" } }).success).toBe(
      false
    );
    expect(dashboardSettingsPatchSchema.safeParse({ layout: { colour: "red" } }).success).toBe(
      false
    );
    expect(dashboardSettingsPatchSchema.safeParse({ theme: "dark" }).success).toBe(false);
  });

  it("reads stored overrides leniently", () => {
    expect(parseDashboardSettingsPatch({ layout: { showStats: false } })).toEqual({
      layout: { showStats: false },
    });
    expect(parseDashboardSettingsPatch({ layout: { showStats: "no" } })).toEqual({});
    expect(parseDashboardSettingsPatch(undefined)).toEqual({});
    expect(parseDashboardSettingsPatch({ layout: [] })).toEqual({});
    expect(parseDashboardSettingsPatch({ layout: { mode: "rows", extra: 1 } })).toEqual({
      layout: { mode: "rows" },
    });
  });

  it("merges patches over a base", () => {
    expect(
      mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, { layout: { mode: "rows" } }).layout
    ).toEqual({ ...DEFAULT_DASHBOARD_SETTINGS.layout, mode: "rows" });
    expect(mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, null)).toEqual(
      DEFAULT_DASHBOARD_SETTINGS
    );
    expect(mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, {})).toEqual(
      DEFAULT_DASHBOARD_SETTINGS
    );
  });

  it("diffs two documents into the smallest patch", () => {
    const next = mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, {
      layout: { showStats: false, density: "tiles" },
    });
    expect(diffDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, next)).toEqual({
      layout: { showStats: false, density: "tiles" },
    });
    expect(diffDashboardSettings(next, next)).toEqual({});
  });

  it("merges patches field by field across sections", () => {
    expect(
      mergeSettingsPatches(
        { layout: { mode: "rows" } },
        { layout: { showStats: false }, appearance: { accent: "mint" } }
      )
    ).toEqual({ layout: { mode: "rows", showStats: false }, appearance: { accent: "mint" } });
    expect(mergeSettingsPatches({}, {})).toEqual({});
  });

  it("diffs appearance too", () => {
    const next = mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, {
      appearance: { theme: "system" },
    });
    expect(diffDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, next)).toEqual({
      appearance: { theme: "system" },
    });
  });

  it("detects empty patches", () => {
    expect(isEmptySettingsPatch(undefined)).toBe(true);
    expect(isEmptySettingsPatch(null)).toBe(true);
    expect(isEmptySettingsPatch({})).toBe(true);
    expect(isEmptySettingsPatch({ layout: {} })).toBe(true);
    expect(isEmptySettingsPatch({ layout: {}, appearance: {} })).toBe(true);
    expect(isEmptySettingsPatch({ appearance: { theme: "dark" } })).toBe(false);
    expect(isEmptySettingsPatch({ layout: { showStats: true } })).toBe(false);
  });
});

describe("devices", () => {
  it("validates device ids", () => {
    expect(isDeviceId("abcd-1234_EF")).toBe(true);
    expect(isDeviceId("short")).toBe(false);
    expect(isDeviceId("../../etc")).toBe(false);
    expect(deviceIdSchema.safeParse("a".repeat(65)).success).toBe(false);
  });

  it("validates device updates", () => {
    expect(deviceUpdateSchema.parse({ name: "  Kitchen tablet ", overrides: null })).toEqual({
      name: "Kitchen tablet",
      overrides: null,
    });
    expect(deviceUpdateSchema.parse({})).toEqual({});
    expect(deviceUpdateSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
    expect(deviceUpdateSchema.safeParse({ color: "red" }).success).toBe(false);
  });

  it("describes the settings response", () => {
    const response = {
      device: { id: "device-1", name: null, overrides: {} },
      effective: DEFAULT_DASHBOARD_SETTINGS,
      settings: DEFAULT_DASHBOARD_SETTINGS,
      stored: false,
    };
    expect(dashboardSettingsResponseSchema.parse(response)).toEqual(response);
  });
});

describe("appearance extras", () => {
  it("keeps a valid title, wallpaper, blur, dim and custom CSS", () => {
    const appearance = {
      title: "Homelab",
      wallpaper: "wallpaper-0123456789abcdef.webp",
      wallpaperBlur: 8,
      wallpaperDim: 55,
      customCss: "body { letter-spacing: 0.01em; }",
    };
    expect(parseDashboardSettings({ appearance }).appearance).toMatchObject(appearance);
    expect(dashboardSettingsPatchSchema.parse({ appearance })).toEqual({ appearance });
  });

  it("falls back for values outside their limits", () => {
    const parsed = parseDashboardSettings({
      appearance: {
        title: "x".repeat(61),
        wallpaper: "/etc/passwd",
        wallpaperBlur: 40,
        wallpaperDim: 12.5,
        customCss: 42,
      },
    }).appearance;
    expect(parsed).toEqual(DEFAULT_DASHBOARD_SETTINGS.appearance);
    expect(parseDashboardSettings({ appearance: { wallpaper: null } }).appearance.wallpaper).toBe(
      null
    );
  });

  it("finds the wallpapers stored settings and device overrides use", () => {
    expect(
      referencedWallpapers([
        { appearance: { wallpaper: "wallpaper-aaaaaaaaaaaaaaaa.png" } },
        { name: "TV", overrides: { appearance: { wallpaper: "wallpaper-bbbbbbbbbbbbbbbb.jpg" } } },
        { appearance: { wallpaper: null } },
        { appearance: { wallpaper: "not-ours.png" } },
        null,
        "broken",
      ])
    ).toEqual(new Set(["wallpaper-aaaaaaaaaaaaaaaa.png", "wallpaper-bbbbbbbbbbbbbbbb.jpg"]));
  });
});

describe("web search", () => {
  it("accepts empty or http(s) templates with a placeholder", () => {
    expect(isSearchUrlTemplate("")).toBe(true);
    expect(isSearchUrlTemplate("https://searx.example.com/search?q=%s")).toBe(true);
    expect(isSearchUrlTemplate("http://10.0.0.5:8080/?q=%s")).toBe(true);
    expect(isSearchUrlTemplate("https://example.com/search")).toBe(false);
    expect(isSearchUrlTemplate("javascript:alert(%s)")).toBe(false);
    expect(isSearchUrlTemplate("not a url %s")).toBe(false);
    expect(isSearchUrlTemplate(`https://example.com/?q=%s&pad=${"x".repeat(500)}`)).toBe(false);
    expect(isSearchUrlTemplate(42)).toBe(false);
  });

  it("builds search URLs for each engine and encodes the query", () => {
    expect(buildSearchUrl({ engine: "duckduckgo", customUrl: "" }, " cat & dog ")).toBe(
      "https://duckduckgo.com/?q=cat%20%26%20dog"
    );
    expect(buildSearchUrl({ engine: "google", customUrl: "" }, "x")).toBe(
      "https://www.google.com/search?q=x"
    );
    expect(
      buildSearchUrl({ engine: "custom", customUrl: "https://searx.lan/search?q=%s" }, "x")
    ).toBe("https://searx.lan/search?q=x");
    expect(buildSearchUrl({ engine: "custom", customUrl: "" }, "x")).toBe(
      "https://duckduckgo.com/?q=x"
    );
  });

  it("reads stored search settings leniently", () => {
    expect(
      parseDashboardSettings({ search: { engine: "altavista", customUrl: "ftp://x/%s" } }).search
    ).toEqual(DEFAULT_DASHBOARD_SETTINGS.search);
  });
});

describe("widgets", () => {
  const portland = { name: "Portland, Oregon", latitude: 45.52, longitude: -122.68 };

  it("keeps valid widget settings and falls back for invalid ones", () => {
    const widgets = parseDashboardSettings({
      widgets: {
        placement: "header",
        clock: true,
        greeting: true,
        clockFormat: "24h",
        weather: true,
        weatherLocation: portland,
        weatherUnits: "imperial",
        agenda: true,
        agendaDays: 14,
      },
    }).widgets;
    expect(widgets).toEqual({
      placement: "header",
      clock: true,
      greeting: true,
      clockFormat: "24h",
      weather: true,
      weatherLocation: portland,
      weatherUnits: "imperial",
      agenda: true,
      agendaDays: 14,
    });

    expect(
      parseDashboardSettings({
        widgets: { placement: "footer", agendaDays: 5, weatherLocation: { name: "x" } },
      }).widgets
    ).toEqual(DEFAULT_DASHBOARD_SETTINGS.widgets);
  });

  it("checks weather locations", () => {
    expect(isWeatherLocation(portland)).toBe(true);
    for (const invalid of [
      null,
      "Portland",
      { ...portland, name: "" },
      { ...portland, name: "x".repeat(121) },
      { ...portland, name: 3 },
      { ...portland, latitude: 91 },
      { ...portland, longitude: -181 },
      { ...portland, latitude: Number.NaN },
      { ...portland, longitude: "1" },
    ]) {
      expect(isWeatherLocation(invalid)).toBe(false);
    }
  });

  it("diffs locations by value", () => {
    const base = mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, {
      widgets: { weatherLocation: portland },
    });
    const same = mergeDashboardSettings(base, { widgets: { weatherLocation: { ...portland } } });
    expect(diffDashboardSettings(base, same)).toEqual({});
    const moved = mergeDashboardSettings(base, {
      widgets: { weatherLocation: { ...portland, latitude: 45.6 } },
    });
    expect(diffDashboardSettings(base, moved)).toEqual({
      widgets: { weatherLocation: { ...portland, latitude: 45.6 } },
    });
  });

  it("validates widget patches strictly", () => {
    expect(
      dashboardSettingsPatchSchema.parse({
        widgets: { weatherLocation: { name: " Portland ", latitude: 45.5, longitude: -122.7 } },
      })
    ).toEqual({
      widgets: { weatherLocation: { name: "Portland", latitude: 45.5, longitude: -122.7 } },
    });
    expect(dashboardSettingsPatchSchema.parse({ widgets: { weatherLocation: null } })).toEqual({
      widgets: { weatherLocation: null },
    });
    for (const widgets of [
      { agendaDays: 2 },
      { clockFormat: "36h" },
      { weatherLocation: { name: "x", latitude: 0, longitude: 0, zoom: 1 } },
      { sparkles: true },
    ]) {
      expect(dashboardSettingsPatchSchema.safeParse({ widgets }).success).toBe(false);
    }
  });
});
