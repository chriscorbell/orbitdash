// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query";
import type { MetricSample } from "@shared/types";

const harness = vi.hoisted(() => ({
  onSample: undefined as ((sample: MetricSample) => void) | undefined,
  servicesRenders: 0,
}));

vi.mock("@/lib/api/metrics", () => ({
  fetchMetrics: vi.fn().mockResolvedValue([]),
  subscribeMetrics: vi.fn((onSample: (sample: MetricSample) => void) => {
    harness.onSample = onSample;
    return () => {};
  }),
}));

vi.mock("@/components/ServicesSection", () => ({
  ServicesSection: () => {
    harness.servicesRenders += 1;
    return <section>Services</section>;
  },
}));

vi.mock("@/components/stats/StatsStrip", async () => {
  const { useMetrics } = await import("@/hooks/useMetrics");
  return {
    StatsStrip: () => <div>{useMetrics().samples.length} points</div>,
  };
});

vi.mock("@/components/header/AppHeader", () => ({ AppHeader: () => <header /> }));
vi.mock("@/components/settings/settings-preload", () => ({
  preloadSettingsDialog: vi.fn(),
  preloadEditableBoard: vi.fn(),
  loadEditableBoard: async () => ({ EditableBoard: () => null }),
  loadSettingsDialog: async () => ({ SettingsDialog: () => null }),
}));
vi.mock("@/hooks/useDashboardSettings", async () => {
  const { DEFAULT_DASHBOARD_SETTINGS } = await import("@shared/dashboard-settings");
  return {
    useDashboardSettings: () => ({
      error: null,
      scope: "all",
      settings: DEFAULT_DASHBOARD_SETTINGS,
      setScope: () => {},
      updateLayout: () => {},
    }),
  };
});
vi.mock("@/components/Footer", () => ({ Footer: () => <footer /> }));

vi.mock("@/hooks/useServices", () => ({
  useServices: () => ({
    services: [],
    loading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
    move: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ categories: [], loading: false, error: null }),
}));

import App from "@/App";

afterEach(() => {
  cleanup();
});

describe("App render isolation", () => {
  it("re-renders only the stats section when a metrics sample arrives", async () => {
    render(<App />, { wrapper: createQueryWrapper().wrapper });
    expect(await screen.findByText("0 points")).toBeTruthy();
    const rendersBefore = harness.servicesRenders;

    for (let index = 1; index <= 3; index++) {
      act(() => {
        harness.onSample?.({ ts: index, cpu: index, ram: 1, disk: 1 });
      });
    }

    expect(await screen.findByText("3 points")).toBeTruthy();
    expect(harness.servicesRenders).toBe(rendersBefore);
  });
});
