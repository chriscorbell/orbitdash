// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query";
import { readLegacyLayout, useDashboardSettings } from "@/hooks/useDashboardSettings";
import {
  DEFAULT_DASHBOARD_SETTINGS,
  mergeDashboardSettings,
  type DashboardSettings,
  type DashboardSettingsPatch,
  type DashboardSettingsResponse,
  type DeviceUpdate,
} from "@shared/dashboard-settings";

const api = vi.hoisted(() => ({
  fetchDashboardSettings: vi.fn(),
  updateDeviceSettings: vi.fn(),
  updateSharedSettings: vi.fn(),
}));

vi.mock("@/lib/api/dashboard-settings", () => api);

/** A tiny in-memory server for the settings endpoints. */
function createServer(initial: { shared?: DashboardSettings; stored?: boolean } = {}) {
  let shared = initial.shared ?? DEFAULT_DASHBOARD_SETTINGS;
  let stored = initial.stored ?? true;
  let overrides: DashboardSettingsPatch = {};

  const view = (): DashboardSettingsResponse => ({
    device: { id: "device-1", name: null, overrides },
    effective: mergeDashboardSettings(shared, overrides),
    settings: shared,
    stored,
  });

  api.fetchDashboardSettings.mockImplementation(async () => view());
  api.updateSharedSettings.mockImplementation(async (patch: DashboardSettingsPatch) => {
    shared = mergeDashboardSettings(shared, patch);
    stored = true;
    return view();
  });
  api.updateDeviceSettings.mockImplementation(async (_id: string, update: DeviceUpdate) => {
    overrides =
      update.overrides === null
        ? {}
        : { layout: { ...overrides.layout, ...update.overrides?.layout } };
    return view();
  });

  return {
    get shared() {
      return shared;
    },
    get overrides() {
      return overrides;
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("orbitdash.deviceId", "device-1");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDashboardSettings", () => {
  it("starts from the cached settings and then loads the server's", async () => {
    window.localStorage.setItem(
      "orbitdash.settingsCache",
      JSON.stringify({ layout: { ...DEFAULT_DASHBOARD_SETTINGS.layout, gridColumns: 5 } })
    );
    createServer({ shared: { layout: { ...DEFAULT_DASHBOARD_SETTINGS.layout, gridColumns: 3 } } });

    const { result } = renderHook(() => useDashboardSettings(), {
      wrapper: createQueryWrapper().wrapper,
    });
    expect(result.current.settings.layout.gridColumns).toBe(5);

    await waitFor(() => expect(result.current.settings.layout.gridColumns).toBe(3));
    expect(
      JSON.parse(window.localStorage.getItem("orbitdash.settingsCache")!).layout.gridColumns
    ).toBe(3);
    expect(api.fetchDashboardSettings).toHaveBeenCalledWith("device-1");
  });

  it("imports old browser preferences as the shared settings on a fresh server", async () => {
    window.localStorage.setItem("orbitdash.servicesFirst", "false");
    window.localStorage.setItem("orbitdash.servicesGrid", "5");
    const server = createServer({ stored: false });

    const { result } = renderHook(() => useDashboardSettings(), {
      wrapper: createQueryWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.settings.layout.gridColumns).toBe(5));
    expect(server.shared.layout).toMatchObject({ servicesFirst: false, gridColumns: 5 });
    expect(result.current.scope).toBe("all");
    expect(window.localStorage.getItem("orbitdash.servicesGrid")).toBeNull();
  });

  it("keeps a browser's different old preferences as its own overrides", async () => {
    window.localStorage.setItem("orbitdash.showStatsSection", "false");
    const server = createServer({ stored: true });

    const { result } = renderHook(() => useDashboardSettings(), {
      wrapper: createQueryWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.scope).toBe("device"));
    expect(server.overrides).toEqual({ layout: { showStats: false } });
    expect(server.shared).toEqual(DEFAULT_DASHBOARD_SETTINGS);
    expect(result.current.settings.layout.showStats).toBe(false);
  });

  it("drops old preferences that already match the shared settings", async () => {
    window.localStorage.setItem("orbitdash.showStatsSection", "true");
    createServer({ stored: true });

    const { result } = renderHook(() => useDashboardSettings(), {
      wrapper: createQueryWrapper().wrapper,
    });

    await waitFor(() => expect(api.fetchDashboardSettings).toHaveBeenCalled());
    await waitFor(() =>
      expect(window.localStorage.getItem("orbitdash.showStatsSection")).toBeNull()
    );
    expect(api.updateDeviceSettings).not.toHaveBeenCalled();
    expect(result.current.scope).toBe("all");
  });

  it("saves layout changes to the shared settings by default", async () => {
    const server = createServer();
    const { result } = renderHook(() => useDashboardSettings(), {
      wrapper: createQueryWrapper().wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateLayout({ servicesFirst: false }));
    await waitFor(() => expect(result.current.settings.layout.servicesFirst).toBe(false));

    await waitFor(() => expect(server.shared.layout.servicesFirst).toBe(false));
    expect(api.updateSharedSettings).toHaveBeenCalledWith(
      { layout: { servicesFirst: false } },
      "device-1"
    );
  });

  it("switches to per-device settings and back", async () => {
    const server = createServer();
    const { result } = renderHook(() => useDashboardSettings(), {
      wrapper: createQueryWrapper().wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setScope("device"));
    await waitFor(() => expect(result.current.scope).toBe("device"));
    expect(server.overrides).toEqual({ layout: DEFAULT_DASHBOARD_SETTINGS.layout });

    act(() => result.current.updateLayout({ gridColumns: 3 }));
    await waitFor(() => expect(server.overrides.layout?.gridColumns).toBe(3));
    await waitFor(() => expect(result.current.settings.layout.gridColumns).toBe(3));
    expect(server.shared.layout.gridColumns).toBe(4);

    act(() => result.current.setScope("device"));
    expect(api.updateDeviceSettings).toHaveBeenCalledTimes(2);

    act(() => result.current.setScope("all"));
    await waitFor(() => expect(result.current.scope).toBe("all"));
    await waitFor(() => expect(result.current.settings.layout.gridColumns).toBe(4));
  });

  it("reverts an optimistic change when saving fails", async () => {
    createServer();
    const { result } = renderHook(() => useDashboardSettings(), {
      wrapper: createQueryWrapper().wrapper,
    });
    await waitFor(() => expect(api.fetchDashboardSettings).toHaveBeenCalled());
    await waitFor(() => expect(result.current.settings).toEqual(DEFAULT_DASHBOARD_SETTINGS));

    api.updateSharedSettings.mockRejectedValueOnce(new Error("offline"));
    act(() => result.current.updateLayout({ showServices: false }));

    await waitFor(() => expect(result.current.error).toBe("offline"));
    expect(result.current.settings.layout.showServices).toBe(true);
  });

  it("reports load failures and keeps working from defaults", async () => {
    api.fetchDashboardSettings.mockRejectedValue(new Error("down"));

    const { result } = renderHook(() => useDashboardSettings(), {
      wrapper: createQueryWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.error).toBe("down"));
    expect(result.current.settings).toEqual(DEFAULT_DASHBOARD_SETTINGS);
  });
});

describe("readLegacyLayout", () => {
  it("returns null when nothing was stored", () => {
    expect(readLegacyLayout()).toBeNull();
  });

  it("reads the oldest section-order key and every newer key", () => {
    window.localStorage.setItem("orbitdash.sectionOrder", "stats-first");
    window.localStorage.setItem("orbitdash.showServicesSection", "false");
    window.localStorage.setItem("orbitdash.servicesGrid", "3");

    expect(readLegacyLayout()).toEqual({
      layout: { gridColumns: 3, servicesFirst: false, showServices: false, showStats: true },
    });
  });

  it("ignores unknown grid values", () => {
    window.localStorage.setItem("orbitdash.servicesGrid", "7");
    expect(readLegacyLayout()?.layout.gridColumns).toBe(4);
  });
});
