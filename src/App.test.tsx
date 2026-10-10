// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";
import type { Service } from "@shared/types";

interface MockServicesProps {
  addOpen: boolean;
  search: string;
}

interface MockSettingsProps {
  open: boolean;
  onShowServicesSectionChange: (visible: boolean) => void;
  onShowStatsSectionChange: (visible: boolean) => void;
  onStatsPositionChange: (position: "top" | "bottom") => void;
}

vi.mock("@/components/Footer", () => ({
  Footer: () => <div data-testid="footer" />,
}));

vi.mock("@/components/ServicesSection", () => ({
  ServicesSection: ({ addOpen, search }: MockServicesProps) => (
    <section data-testid="services-section">
      <span data-testid="add-open">{String(addOpen)}</span>
      <span data-testid="search">{search}</span>
    </section>
  ),
}));

vi.mock("@/components/settings/SettingsDialog", () => ({
  SettingsDialog: ({
    open,
    onShowServicesSectionChange,
    onShowStatsSectionChange,
    onStatsPositionChange,
  }: MockSettingsProps) =>
    open ? (
      <div role="dialog" aria-label="Settings">
        <button type="button" onClick={() => onShowServicesSectionChange(false)}>
          Hide services
        </button>
        <button type="button" onClick={() => onShowStatsSectionChange(false)}>
          Hide stats
        </button>
        <button type="button" onClick={() => onStatsPositionChange("bottom")}>
          Stats below
        </button>
      </div>
    ) : null,
}));

vi.mock("@/hooks/useCategoryOrder", () => ({
  useCategoryOrder: vi.fn(),
}));

vi.mock("@/hooks/useMetrics", () => ({
  useMetrics: () => ({
    samples: [],
    latest: null,
    status: "connecting",
    error: null,
    recoveredAt: null,
  }),
}));

vi.mock("@/hooks/useServices", () => ({
  useServices: vi.fn(),
}));

vi.mock("@/lib/api/system", () => ({
  fetchSystemInfo: vi.fn().mockResolvedValue({
    cpuCount: 8,
    hostname: "cloud",
    platform: "linux",
    uptimeSeconds: 90_000,
  }),
}));

vi.mock("@/lib/api/dashboard-settings", async () => {
  const shared = await import("@shared/dashboard-settings");
  let stored = shared.DEFAULT_DASHBOARD_SETTINGS;
  const view = () => ({ device: null, effective: stored, settings: stored, stored: true });
  return {
    fetchDashboardSettings: vi.fn(async () => view()),
    updateSharedSettings: vi.fn(
      async (patch: Parameters<typeof shared.mergeDashboardSettings>[1]) => {
        stored = shared.mergeDashboardSettings(stored, patch);
        return view();
      }
    ),
    updateDeviceSettings: vi.fn(async () => view()),
    resetForTesting: () => {
      stored = shared.DEFAULT_DASHBOARD_SETTINGS;
    },
  };
});

import App from "@/App";
import { useCategoryOrder } from "@/hooks/useCategoryOrder";
import { useServices } from "@/hooks/useServices";

const categoryOrderStub = {
  visibleCategoryOrder: [],
  namedCategories: [],
  beginReorder: vi.fn(),
  cancelReorder: vi.fn(),
} as unknown as UseCategoryOrderResult;

const serviceStub: Service = {
  id: "svc-1",
  name: "Orbit",
  url: "https://example.com/orbit",
  description: null,
  icon: null,
  icon_source_url: null,
  category: null,
  category_id: null,
  position: 0,
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
};

function renderApp() {
  return render(<App />, { wrapper: createQueryWrapper().wrapper });
}

function isBefore(first: Element, second: Element) {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(async () => {
  window.localStorage.clear();
  const settingsApi = (await import("@/lib/api/dashboard-settings")) as unknown as {
    resetForTesting: () => void;
  };
  settingsApi.resetForTesting();

  vi.mocked(useServices).mockReturnValue({
    services: [serviceStub],
    loading: false,
    error: null,
    create: vi.fn().mockResolvedValue(serviceStub),
    update: vi.fn().mockResolvedValue(serviceStub),
    duplicate: vi.fn().mockResolvedValue(serviceStub),
    remove: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(serviceStub),
    renameCategory: vi.fn().mockResolvedValue({ services: [], order: [] }),
    reload: vi.fn().mockResolvedValue(undefined),
  });
  vi.mocked(useCategoryOrder).mockReturnValue(categoryOrderStub);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("App", () => {
  it("shows the live stats strip above the services by default", async () => {
    renderApp();

    const services = await screen.findByTestId("services-section");
    const stats = screen.getByRole("region", { name: "Live stats" });
    expect(isBefore(stats, services)).toBe(true);
  });

  it("moves the stats below services when settings say so", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(screen.getByRole("button", { name: "Stats below" }));

    await waitFor(() => {
      const services = screen.getByTestId("services-section");
      const stats = screen.getByRole("region", { name: "Live stats" });
      expect(isBefore(services, stats)).toBe(true);
    });
  });

  it("passes the header's search and add action to the services", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByRole("searchbox", { name: "Search services" }), "jelly");
    expect(screen.getByTestId("search").textContent).toBe("jelly");

    await user.click(screen.getByRole("button", { name: "Add service" }));
    expect(screen.getByTestId("add-open").textContent).toBe("true");
  });

  it("explains an empty page when everything is hidden", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(screen.getByRole("button", { name: "Hide services" }));
    await user.click(screen.getByRole("button", { name: "Hide stats" }));

    expect(await screen.findByText("Nothing is shown right now")).toBeTruthy();
    expect(screen.queryByTestId("services-section")).toBeNull();
    expect(screen.queryByRole("region", { name: "Live stats" })).toBeNull();
  });
});
