// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/components/settings/SettingsPage";
import type { SettingsProps, SettingsSectionId } from "@/components/settings/settings-sections";
import { settingsSectionFromPath } from "@/components/settings/settings-sections";
import { createQueryWrapper } from "@/test/query";
import { DEFAULT_DASHBOARD_SETTINGS } from "@shared/dashboard-settings";

vi.mock("@/components/settings/AlertSettings", () => ({
  AlertSettings: () => <div data-testid="alert-settings" />,
}));
vi.mock("@/components/settings/notifications/NotificationSettings", () => ({
  NotificationSettings: () => <div data-testid="notification-settings" />,
}));
vi.mock("@/components/settings/BackupSettingsSection", () => ({
  BackupSettingsSection: () => <div data-testid="backup-settings" />,
}));
vi.mock("@/components/settings/DashboardImportSettings", () => ({
  DashboardImportSettings: () => <div data-testid="dashboard-import-settings" />,
}));
const docker = vi.hoisted(() => ({ fetchDocker: vi.fn() }));
vi.mock("@/lib/api/docker", () => docker);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

function renderPage(section: SettingsSectionId | null, overrides: Partial<SettingsProps> = {}) {
  const props: SettingsProps = {
    appearance: DEFAULT_DASHBOARD_SETTINGS.appearance,
    density: "comfortable",
    linkPreference: "auto",
    mode: "columns",
    search: DEFAULT_DASHBOARD_SETTINGS.search,
    widgets: DEFAULT_DASHBOARD_SETTINGS.widgets,
    statsPosition: "top",
    settingsScope: "all",
    showServicesSection: true,
    showStatsSection: true,
    showStatsPage: true,
    onAppearanceChange: vi.fn(),
    onAppearancePreview: vi.fn(),
    onDensityChange: vi.fn(),
    onEditLayout: vi.fn(),
    onLinkPreferenceChange: vi.fn(),
    onModeChange: vi.fn(),
    onSearchChange: vi.fn(),
    onStatsPositionChange: vi.fn(),
    onSettingsScopeChange: vi.fn(),
    onShowServicesSectionChange: vi.fn(),
    onShowStatsSectionChange: vi.fn(),
    onShowStatsPageChange: vi.fn(),
    onWidgetsChange: vi.fn(),
    ...overrides,
  };
  render(<SettingsPage section={section} {...props} />, { wrapper: createQueryWrapper().wrapper });
  return { props, user: userEvent.setup() };
}

describe("settingsSectionFromPath", () => {
  it("reads the section from the URL", () => {
    expect(settingsSectionFromPath("/settings/layout")).toBe("layout");
    expect(settingsSectionFromPath("/settings")).toBeNull();
    expect(settingsSectionFromPath("/settings/nope")).toBeNull();
  });
});

describe("SettingsPage", () => {
  it("lists every section and opens one as its own page", async () => {
    const { user } = renderPage(null);
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual([
      "General",
      "Appearance",
      "Layout",
      "Widgets",
      "Search",
      "Alerts",
      "Notifications",
      "Docker",
      "Data",
      "Security",
    ]);
    // On /settings, wide screens show General beside the list.
    expect(within(nav).getByRole("link", { name: "General" }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(screen.getByRole("heading", { name: "General", level: 2 })).toBeTruthy();

    await user.click(within(nav).getByRole("link", { name: "Layout" }));
    expect(window.location.pathname).toBe("/settings/layout");
  });

  it("toggles what the dashboard shows and names it", async () => {
    const { props, user } = renderPage("general");
    await user.click(await screen.findByRole("switch", { name: "Services section" }));
    expect(props.onShowServicesSectionChange).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole("switch", { name: "Stats page" }));
    expect(props.onShowStatsPageChange).toHaveBeenCalledWith(false);
  });

  it("switches between shared and per-device settings on scoped sections", async () => {
    const { props, user } = renderPage("appearance");
    expect(screen.getByRole("button", { name: "All devices" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(
      screen.getByText("Appearance, layout and widget changes apply to every browser.")
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "This device" }));
    expect(props.onSettingsScopeChange).toHaveBeenCalledWith("device");
    cleanup();

    renderPage("alerts");
    expect(screen.queryByRole("button", { name: "This device" })).toBeNull();
    expect(await screen.findByTestId("alert-settings")).toBeTruthy();
  });

  it("explains per-device scope and shows save errors", () => {
    renderPage("layout", { settingsScope: "device", settingsError: "Failed to save settings" });
    expect(
      screen.getByText("Appearance, layout and widget changes apply only to this browser.")
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Failed to save settings");
  });

  it("changes the theme and accent", async () => {
    const { props, user } = renderPage("appearance");
    expect((await screen.findByRole("radio", { name: "Dark" })).getAttribute("aria-checked")).toBe(
      "true"
    );
    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(props.onAppearanceChange).toHaveBeenCalledWith({ theme: "light" });
    await user.click(screen.getByRole("radio", { name: "Mint" }));
    expect(props.onAppearanceChange).toHaveBeenCalledWith({ accent: "mint" });
  });

  it("sets the arrangement, card style, stats position and service links", async () => {
    const { props, user } = renderPage("layout");
    const arrangement = await screen.findByRole("radiogroup", { name: "Arrangement" });
    await user.click(within(arrangement).getByRole("radio", { name: "Rows" }));
    await user.click(screen.getByRole("radio", { name: "Tiles" }));
    await user.click(screen.getByRole("radio", { name: "Below services" }));
    // The test page runs on localhost, which is your own network.
    expect(screen.getByText(/Auto picks internal on this address/)).toBeTruthy();
    await user.click(
      within(screen.getByRole("radiogroup", { name: "Service links" })).getByRole("radio", {
        name: "External",
      })
    );
    expect(props.onModeChange).toHaveBeenCalledWith("rows");
    expect(props.onDensityChange).toHaveBeenCalledWith("tiles");
    expect(props.onStatsPositionChange).toHaveBeenCalledWith("bottom");
    expect(props.onLinkPreferenceChange).toHaveBeenCalledWith("external");

    const cards = screen.getByRole("radio", { name: "Cards" });
    cards.focus();
    await user.keyboard("{ArrowRight}");
    expect(props.onDensityChange).toHaveBeenLastCalledWith("tiles");

    await user.click(screen.getByRole("button", { name: "Edit layout" }));
    expect(props.onEditLayout).toHaveBeenCalledTimes(1);
  });

  it("turns widgets on and picks the web search engine", async () => {
    const { props, user } = renderPage("widgets");
    await user.click(await screen.findByRole("switch", { name: "Clock" }));
    expect(props.onWidgetsChange).toHaveBeenCalledWith({ clock: true });
    cleanup();

    const search = renderPage("search");
    await search.user.click(await screen.findByRole("combobox", { name: "Web search" }));
    await search.user.click(await screen.findByRole("option", { name: "Google" }));
    expect(search.props.onSearchChange).toHaveBeenCalledWith({ engine: "google" });
  });

  it("shows notifications and data sections", async () => {
    renderPage("notifications");
    expect(await screen.findByTestId("notification-settings")).toBeTruthy();
    cleanup();
    renderPage("data");
    expect(await screen.findByTestId("dashboard-import-settings")).toBeTruthy();
    expect(screen.getByTestId("backup-settings")).toBeTruthy();
  });

  it("reports whether Docker is connected", async () => {
    docker.fetchDocker.mockResolvedValue({
      configured: true,
      available: true,
      error: null,
      containers: [
        {
          id: "1",
          name: "web",
          image: "nginx",
          state: "running",
          status: "Up",
          health: null,
          createdAt: 0,
          ports: [],
          composeProject: null,
          cpuPercent: null,
          memoryBytes: null,
          memoryLimitBytes: null,
        },
      ],
      updatedAt: 1,
    });
    renderPage("docker");
    expect(await screen.findByText("Connected · 1 of 1 containers running")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Containers" }).getAttribute("href")).toBe(
      "/stats#containers"
    );
    cleanup();

    docker.fetchDocker.mockResolvedValue({
      configured: true,
      available: false,
      error: "No permission to use the Docker socket",
      containers: [],
      updatedAt: 1,
    });
    renderPage("docker");
    expect(await screen.findByText("No permission to use the Docker socket")).toBeTruthy();
    cleanup();

    docker.fetchDocker.mockResolvedValue({
      configured: false,
      available: false,
      error: null,
      containers: [],
      updatedAt: null,
    });
    renderPage("docker");
    expect(await screen.findByText("Not set up")).toBeTruthy();
  });

  it("shows who is signed in, or that sign-in is off", async () => {
    const onSignOut = vi.fn();
    const { user } = renderPage("security", {
      account: { mode: "password", user: "admin", onSignOut },
    });
    expect(await screen.findByText("With the dashboard password")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalled();
    cleanup();

    renderPage("security", { account: { mode: "proxy", user: "chris@example.com" } });
    expect(await screen.findByText("chris@example.com")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    cleanup();

    renderPage("security");
    expect(await screen.findByText("Sign-in is off")).toBeTruthy();
  });
});
