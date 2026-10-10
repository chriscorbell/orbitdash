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
        linkPreference: "auto",
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

describe("link preference", () => {
  it("defaults to auto and keeps only the known choices", () => {
    expect(DEFAULT_DASHBOARD_SETTINGS.layout.linkPreference).toBe("auto");
    expect(parseDashboardSettings({ layout: { linkPreference: "external" } }).layout).toMatchObject(
      { linkPreference: "external" }
    );
    expect(
      parseDashboardSettings({ layout: { linkPreference: "public" } }).layout.linkPreference
    ).toBe("auto");
    expect(dashboardSettingsPatchSchema.parse({ layout: { linkPreference: "internal" } })).toEqual({
      layout: { linkPreference: "internal" },
    });
    expect(
      dashboardSettingsPatchSchema.safeParse({ layout: { linkPreference: "lan" } }).success
    ).toBe(false);
  });

  it("reads settings saved before it existed as auto", () => {
    const { linkPreference: _omitted, ...olderLayout } = DEFAULT_DASHBOARD_SETTINGS.layout;
    const older = { ...DEFAULT_DASHBOARD_SETTINGS, layout: olderLayout };
    const parsed = dashboardSettingsResponseSchema.parse({
      device: null,
      effective: older,
      settings: older,
      stored: true,
    });
    expect(parsed.settings.layout.linkPreference).toBe("auto");
    expect(parsed.effective.layout.linkPreference).toBe("auto");
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
