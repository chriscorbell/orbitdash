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
  parseDashboardSettings,
  parseDashboardSettingsPatch,
} from "./dashboard-settings";

describe("parseDashboardSettings", () => {
  it("returns defaults for missing or unreadable documents", () => {
    expect(parseDashboardSettings(undefined)).toEqual(DEFAULT_DASHBOARD_SETTINGS);
    expect(parseDashboardSettings(null)).toEqual(DEFAULT_DASHBOARD_SETTINGS);
    expect(parseDashboardSettings("nope")).toEqual(DEFAULT_DASHBOARD_SETTINGS);
    expect(parseDashboardSettings({})).toEqual(DEFAULT_DASHBOARD_SETTINGS);
  });

  it("keeps valid fields and replaces only the invalid ones", () => {
    expect(
      parseDashboardSettings({
        layout: { gridColumns: 9, servicesFirst: false, showServices: "yes" },
        future: { setting: true },
      })
    ).toEqual({
      layout: { gridColumns: 4, servicesFirst: false, showServices: true, showStats: true },
    });
  });

  it("falls back to default layout when the section is not an object", () => {
    expect(parseDashboardSettings({ layout: 3 })).toEqual(DEFAULT_DASHBOARD_SETTINGS);
  });
});

describe("patches", () => {
  it("accepts partial layout changes and rejects unknown or invalid fields", () => {
    expect(dashboardSettingsPatchSchema.parse({ layout: { gridColumns: 5 } })).toEqual({
      layout: { gridColumns: 5 },
    });
    expect(dashboardSettingsPatchSchema.parse({})).toEqual({});
    expect(dashboardSettingsPatchSchema.safeParse({ layout: { gridColumns: 6 } }).success).toBe(
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
    expect(parseDashboardSettingsPatch({ layout: { gridColumns: 3, extra: 1 } })).toEqual({
      layout: { gridColumns: 3 },
    });
  });

  it("merges patches over a base", () => {
    expect(
      mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, { layout: { gridColumns: 3 } }).layout
    ).toEqual({ ...DEFAULT_DASHBOARD_SETTINGS.layout, gridColumns: 3 });
    expect(mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, null)).toEqual(
      DEFAULT_DASHBOARD_SETTINGS
    );
    expect(mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, {})).toEqual(
      DEFAULT_DASHBOARD_SETTINGS
    );
  });

  it("diffs two documents into the smallest patch", () => {
    const next = mergeDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, {
      layout: { showStats: false, gridColumns: 5 },
    });
    expect(diffDashboardSettings(DEFAULT_DASHBOARD_SETTINGS, next)).toEqual({
      layout: { showStats: false, gridColumns: 5 },
    });
    expect(diffDashboardSettings(next, next)).toEqual({});
  });

  it("detects empty patches", () => {
    expect(isEmptySettingsPatch(undefined)).toBe(true);
    expect(isEmptySettingsPatch(null)).toBe(true);
    expect(isEmptySettingsPatch({})).toBe(true);
    expect(isEmptySettingsPatch({ layout: {} })).toBe(true);
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
