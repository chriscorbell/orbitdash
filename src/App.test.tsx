// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query";
import type { UseCategoriesResult } from "@/hooks/useCategories";
import type { Service } from "@shared/types";

interface MockServicesProps {
  addOpen: boolean;
  editing: boolean;
  renamingKey: string | null;
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
  ServicesSection: ({ addOpen, editing, renamingKey, search }: MockServicesProps) => (
    <section data-testid="services-section">
      <span data-testid="add-open">{String(addOpen)}</span>
      <span data-testid="editing">{String(editing)}</span>
      <span data-testid="renaming">{renamingKey ?? ""}</span>
      <span data-testid="search">{search}</span>
    </section>
  ),
}));

// The app loads the settings dialog lazily through this module.
vi.mock("@/components/settings/settings-preload", () => ({
  preloadSettingsDialog: vi.fn(),
  preloadEditableBoard: vi.fn(),
  preloadStatsPage: vi.fn(),
  loadEditableBoard: async () => ({ EditableBoard: () => null }),
  loadStatsPage: async () => ({
    StatsPage: ({ themeKey }: { themeKey: string }) => (
      <div data-testid="stats-page">{themeKey}</div>
    ),
  }),
  loadSettingsDialog: async () => ({
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
  }),
}));

vi.mock("@/hooks/useCategories", () => ({
  useCategories: vi.fn(),
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
import { useCategories } from "@/hooks/useCategories";
import { useServices } from "@/hooks/useServices";

function categoriesStub(): UseCategoriesResult {
  return {
    categories: [{ id: "cat-1", name: "New category", position: 0, created_at: 1, updated_at: 1 }],
    loading: false,
    error: null,
    create: vi.fn().mockResolvedValue({
      id: "cat-2",
      name: "New category 2",
      position: 1,
      created_at: 1,
      updated_at: 1,
    }),
    rename: vi.fn(),
    remove: vi.fn(),
    reorder: vi.fn(),
  };
}

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
    move: vi.fn().mockResolvedValue(serviceStub),
    reload: vi.fn().mockResolvedValue(undefined),
  });
  vi.mocked(useCategories).mockReturnValue(categoriesStub());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
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
    await user.click(await screen.findByRole("button", { name: "Stats below" }));

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
    await user.click(await screen.findByRole("button", { name: "Hide services" }));
    await user.click(screen.getByRole("button", { name: "Hide stats" }));

    expect(await screen.findByText("Nothing is shown right now")).toBeTruthy();
    expect(screen.queryByTestId("services-section")).toBeNull();
    expect(screen.queryByRole("region", { name: "Live stats" })).toBeNull();
  });

  it("enters edit mode, names a new category in place, and leaves with Done", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByRole("searchbox", { name: "Search services" }), "jelly");
    await user.click(screen.getByRole("button", { name: "Edit layout" }));

    expect(screen.getByTestId("editing").textContent).toBe("true");
    expect(screen.getByTestId("search").textContent).toBe("");

    await user.click(screen.getByRole("button", { name: "New category" }));
    const categories = vi.mocked(useCategories).mock.results.at(-1)!.value as UseCategoriesResult;
    expect(categories.create).toHaveBeenCalledWith("New category 2");
    await waitFor(() => expect(screen.getByTestId("renaming").textContent).toBe("cat-2"));

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByTestId("editing").textContent).toBe("false");
    expect(screen.getByTestId("renaming").textContent).toBe("");
  });

  it("reports a category that could not be created", async () => {
    const user = userEvent.setup();
    const categories = categoriesStub();
    vi.mocked(categories.create).mockRejectedValue(new Error("Offline"));
    vi.mocked(useCategories).mockReturnValue(categories);
    renderApp();

    await user.click(screen.getByRole("button", { name: "Edit layout" }));
    await user.click(screen.getByRole("button", { name: "New category" }));

    expect(await screen.findByText("Couldn't create the category")).toBeTruthy();
  });

  it("opens the Stats page from its tab and comes back to services", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("link", { name: "Stats" }));
    expect((await screen.findByTestId("stats-page")).textContent).toBe("dark-ice");
    expect(screen.queryByTestId("services-section")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add service" })).toBeNull();
    expect(window.location.pathname).toBe("/stats");

    await user.click(screen.getByRole("link", { name: "Services" }));
    expect(await screen.findByTestId("services-section")).toBeTruthy();
    expect(window.location.pathname).toBe("/");
  });
});
