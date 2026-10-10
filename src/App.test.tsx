// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query";
import type { UseCategoriesResult } from "@/hooks/useCategories";
import type { AuthSession } from "@shared/auth";
import type { Service } from "@shared/types";

interface MockServicesProps {
  addOpen: boolean;
  editing: boolean;
  renamingKey: string | null;
}

interface MockSettingsProps {
  account?: { mode: string; user: string | null; onSignOut?: () => void };
  section?: string | null;
  onShowServicesSectionChange: (visible: boolean) => void;
  onShowStatsSectionChange: (visible: boolean) => void;
  onStatsPositionChange: (position: "top" | "bottom") => void;
}

vi.mock("@/components/Footer", () => ({
  Footer: () => <div data-testid="footer" />,
}));

vi.mock("@/components/ServicesSection", () => ({
  ServicesSection: ({ addOpen, editing, renamingKey }: MockServicesProps) => (
    <section data-testid="services-section">
      <span data-testid="add-open">{String(addOpen)}</span>
      <span data-testid="editing">{String(editing)}</span>
      <span data-testid="renaming">{renamingKey ?? ""}</span>
    </section>
  ),
}));

// The app loads the settings dialog lazily through this module.
vi.mock("@/components/settings/settings-preload", () => ({
  preloadSettingsPage: vi.fn(),
  preloadEditableBoard: vi.fn(),
  preloadStatsPage: vi.fn(),
  loadEditableBoard: async () => ({ EditableBoard: () => null }),
  preloadCommandPalette: vi.fn(),
  loadCommandPalette: async () => {
    const { buildPaletteActions } = await import("@/components/palette/palette-actions");
    return {
      CommandPalette: ({
        open,
        initialQuery,
        context,
        onOpenChange,
      }: {
        open: boolean;
        initialQuery: string;
        context: Parameters<typeof buildPaletteActions>[0];
        onOpenChange: (open: boolean) => void;
      }) =>
        open ? (
          <div role="dialog" aria-label="Palette">
            <span data-testid="palette-query">{initialQuery}</span>
            {buildPaletteActions(context).map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  action.run();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null,
    };
  },
  loadStatsPage: async () => ({
    StatsPage: ({ themeKey }: { themeKey: string }) => (
      <div data-testid="stats-page">{themeKey}</div>
    ),
  }),
  loadSettingsPage: async () => ({
    SettingsPage: ({
      account,
      section,
      onShowServicesSectionChange,
      onShowStatsSectionChange,
      onStatsPositionChange,
    }: MockSettingsProps) =>
      section !== undefined ? (
        <div role="region" aria-label="Settings">
          <span data-testid="settings-section">{section ?? "none"}</span>
          {account && (
            <button type="button" onClick={account.onSignOut}>
              Sign out as {account.user ?? account.mode}
            </button>
          )}
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

vi.mock("@/lib/api/alerts", () => ({
  fetchAlerts: vi.fn().mockResolvedValue({ active: [], recent: [], rules: [] }),
  subscribeAlerts: vi.fn(() => () => {}),
  updateAlertRules: vi.fn(),
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
  check_enabled: false,
  check_method: "http",
  check_target: null,
  check_interval: 60,
  check_ignore_tls: false,
  external_url: null,
  links: [],
  tags: [],
};

function renderApp(props: Parameters<typeof App>[0] = {}) {
  return render(<App {...props} />, { wrapper: createQueryWrapper().wrapper });
}

const guest: AuthSession = {
  authenticated: false,
  canEdit: false,
  guest: "view",
  mode: "password",
  user: null,
};

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
    await user.click(screen.getByRole("link", { name: "Services" }));

    await waitFor(() => {
      const services = screen.getByTestId("services-section");
      const stats = screen.getByRole("region", { name: "Live stats" });
      expect(isBefore(services, stats)).toBe(true);
    });
  });

  it("passes the header's add action to the services", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Add service" }));
    expect(screen.getByTestId("add-open").textContent).toBe("true");
  });

  it("explains an empty page when everything is hidden", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(await screen.findByRole("button", { name: "Hide services" }));
    await user.click(screen.getByRole("button", { name: "Hide stats" }));
    await user.click(screen.getByRole("link", { name: "Services" }));

    expect(await screen.findByText("Nothing is shown right now")).toBeTruthy();
    expect(screen.queryByTestId("services-section")).toBeNull();
    expect(screen.queryByRole("region", { name: "Live stats" })).toBeNull();
  });

  it("enters edit mode, names a new category in place, and leaves with Done", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Edit layout" }));

    expect(screen.getByTestId("editing").textContent).toBe("true");

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
    expect(screen.queryByRole("button", { name: "Add service" })).toBeNull();
    expect(window.location.pathname).toBe("/stats");

    await user.click(screen.getByRole("link", { name: "Services" }));
    expect(await screen.findByTestId("services-section")).toBeTruthy();
    expect(window.location.pathname).toBe("/");
  });

  it("opens the palette by typing anywhere or with Ctrl+K, and runs its actions", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByTestId("services-section");

    await user.keyboard("j");
    expect((await screen.findByTestId("palette-query")).textContent).toBe("j");
    await user.click(screen.getByRole("button", { name: "Use light theme" }));
    expect(screen.queryByRole("dialog", { name: "Palette" })).toBeNull();

    await user.keyboard("{Control>}k{/Control}");
    expect((await screen.findByTestId("palette-query")).textContent).toBe("");
    await user.click(screen.getByRole("button", { name: "Go to Stats" }));
    expect(await screen.findByTestId("stats-page")).toBeTruthy();
  });

  it("opens the palette from the header search field", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Search services and commands" }));
    const palette = await screen.findByRole("dialog", { name: "Palette" });
    await user.click(within(palette).getByRole("button", { name: "Edit layout" }));
    expect(screen.getByTestId("editing").textContent).toBe("true");
  });
  it("shows guests a read-only dashboard with a sign-in button", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    renderApp({ auth: guest, onSignIn });
    await screen.findByTestId("services-section");

    for (const name of ["Add service", "Edit layout", "Open settings"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalled();
  });

  it("keeps changes out of the palette for guests", async () => {
    const user = userEvent.setup();
    renderApp({ auth: guest });
    await screen.findByTestId("services-section");

    await user.click(screen.getByRole("button", { name: "Search services and commands" }));
    const palette = await screen.findByRole("dialog", { name: "Palette" });
    expect(within(palette).getByRole("button", { name: "Go to Stats" })).toBeTruthy();
    for (const name of ["Add service", "Edit layout", "Open settings", "Use light theme"]) {
      expect(within(palette).queryByRole("button", { name })).toBeNull();
    }
  });

  it("offers no sign-in button to proxy guests", async () => {
    renderApp({ auth: { ...guest, mode: "proxy" } });
    await screen.findByTestId("services-section");

    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("leaves edit mode when the session can no longer edit", async () => {
    const user = userEvent.setup();
    const signedIn: AuthSession = { ...guest, authenticated: true, canEdit: true, user: "admin" };
    const view = renderApp({ auth: signedIn });

    await user.click(screen.getByRole("button", { name: "Edit layout" }));
    expect(screen.getByTestId("editing").textContent).toBe("true");

    view.rerender(<App auth={guest} />);
    expect(screen.getByTestId("editing").textContent).toBe("false");
  });

  it("opens settings as a page and keeps guests on the dashboard", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(window.location.pathname).toBe("/settings");
    expect((await screen.findByTestId("settings-section")).textContent).toBe("none");
    expect(screen.getByRole("button", { name: "Open settings" }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(screen.queryByTestId("services-section")).toBeNull();
    cleanup();

    window.history.replaceState(null, "", "/settings/widgets");
    renderApp();
    expect((await screen.findByTestId("settings-section")).textContent).toBe("widgets");
    cleanup();

    renderApp({ auth: guest });
    expect(await screen.findByTestId("services-section")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Settings" })).toBeNull();
  });

  it("signs out from settings", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    renderApp({
      auth: { ...guest, authenticated: true, canEdit: true, user: "admin" },
      onSignOut,
    });

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(await screen.findByRole("button", { name: "Sign out as admin" }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
