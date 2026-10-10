// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState, type ComponentProps } from "react";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { DEFAULT_DASHBOARD_SETTINGS } from "@shared/dashboard-settings";

type DialogProps = Omit<ComponentProps<typeof SettingsDialog>, "open" | "onOpenChange">;

/** The dialog with a trigger, the way the app header opens it. */
function SettingsHarness(props: DialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open settings
      </button>
      <SettingsDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}

vi.mock("@/components/settings/AlertSettings", () => ({
  AlertSettings: () => <div data-testid="alert-settings" />,
}));

vi.mock("@/components/settings/BackupSettingsSection", () => ({
  BackupSettingsSection: () => <div data-testid="backup-settings" />,
}));

vi.mock("@/components/settings/DashboardImportSettings", () => ({
  DashboardImportSettings: () => <div data-testid="dashboard-import-settings" />,
}));

afterEach(() => {
  cleanup();
});

function renderHeader(overrides: Partial<DialogProps> = {}) {
  const props: DialogProps = {
    appearance: DEFAULT_DASHBOARD_SETTINGS.appearance,
    density: "comfortable",
    linkPreference: "auto",
    mode: "columns",
    search: DEFAULT_DASHBOARD_SETTINGS.search,
    widgets: DEFAULT_DASHBOARD_SETTINGS.widgets,
    onWidgetsChange: vi.fn(),
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
    ...overrides,
  };

  return {
    ...render(<SettingsHarness {...props} />),
    props,
  };
}

describe("SettingsDialog", () => {
  it("turns widgets on and picks where they show", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(await screen.findByRole("switch", { name: "Clock" }));
    expect(props.onWidgetsChange).toHaveBeenCalledWith({ clock: true });
    await user.click(screen.getByRole("radio", { name: "In the header" }));
    expect(props.onWidgetsChange).toHaveBeenLastCalledWith({ placement: "header" });
    await user.click(screen.getByRole("radio", { name: "24-hour" }));
    expect(props.onWidgetsChange).toHaveBeenLastCalledWith({ clockFormat: "24h" });
    // The greeting belongs to the clock, so it only shows once the clock is on.
    expect(screen.queryByRole("switch", { name: "Greeting" })).toBeNull();
  });

  it("hides row-only widgets when they show in the header", async () => {
    const user = userEvent.setup();
    renderHeader({
      widgets: { ...DEFAULT_DASHBOARD_SETTINGS.widgets, placement: "header", clock: true },
    });
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(await screen.findByRole("switch", { name: "Weather" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Clock" })).toBeNull();
  });

  it("changes the theme and accent from settings", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Ice" }).getAttribute("aria-checked")).toBe("true");

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(props.onAppearanceChange).toHaveBeenCalledWith({ theme: "light" });

    await user.click(screen.getByRole("radio", { name: "Mint" }));
    expect(props.onAppearanceChange).toHaveBeenCalledWith({ accent: "mint" });
  });

  it("switches between shared and per-device settings", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("button", { name: "All devices" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByText("Appearance and layout changes apply to every browser.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "This device" }));
    expect(props.onSettingsScopeChange).toHaveBeenCalledWith("device");
  });

  it("explains per-device scope and shows save errors", async () => {
    const user = userEvent.setup();
    renderHeader({ settingsScope: "device", settingsError: "Failed to save settings" });

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    expect(
      screen.getByText("Appearance and layout changes apply only to this browser.")
    ).toBeTruthy();
    expect(screen.getByText("Failed to save settings")).toBeTruthy();
  });

  it("opens settings in a dialog and toggles the services section", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    expect(screen.getByRole("dialog", { name: "Dashboard settings" })).toBeTruthy();

    await user.click(screen.getByRole("switch", { name: "Services section" }));

    expect(props.onShowServicesSectionChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog", { name: "Dashboard settings" })).toBeTruthy();
  });

  it("moves the stats strip above or below services", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader({ statsPosition: "top" });

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("radio", { name: "Above services" }).getAttribute("aria-checked")).toBe(
      "true"
    );
    await user.click(screen.getByRole("radio", { name: "Below services" }));

    expect(props.onStatsPositionChange).toHaveBeenCalledWith("bottom");
  });

  it("picks which URL services open, saying what auto does on this address", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader({ linkPreference: "auto" });

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    const links = screen.getByRole("radiogroup", { name: "Service links" });
    expect(within(links).getByRole("radio", { name: "Auto" }).getAttribute("aria-checked")).toBe(
      "true"
    );
    // The test page runs on localhost, which is your own network.
    expect(screen.getByText(/Auto picks internal on this address/)).toBeTruthy();
    await user.click(within(links).getByRole("radio", { name: "External" }));

    expect(props.onLinkPreferenceChange).toHaveBeenCalledWith("external");
  });

  it("switches the arrangement and card style", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    const arrangement = screen.getByRole("radiogroup", { name: "Arrangement" });
    expect(
      within(arrangement).getByRole("radio", { name: "Columns" }).getAttribute("aria-checked")
    ).toBe("true");
    await user.click(within(arrangement).getByRole("radio", { name: "Rows" }));
    await user.click(screen.getByRole("radio", { name: "Tiles" }));

    expect(props.onModeChange).toHaveBeenCalledWith("rows");
    expect(props.onDensityChange).toHaveBeenCalledWith("tiles");
  });

  it("moves between choices with the arrow keys", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    const cards = screen.getByRole("radio", { name: "Cards" });
    cards.focus();
    await user.keyboard("{ArrowRight}");
    expect(props.onDensityChange).toHaveBeenLastCalledWith("tiles");
    await user.keyboard("{ArrowLeft}");
    expect(props.onDensityChange).toHaveBeenLastCalledWith("compact");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Compact" }));
  });

  it("sends category editing to the dashboard's edit mode", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(screen.getByRole("button", { name: "Edit layout" }));

    expect(props.onEditLayout).toHaveBeenCalledTimes(1);
  });

  it("shows who is signed in, with sign-out in password mode", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    renderHeader({ account: { mode: "password", user: "admin", onSignOut } });

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("With the dashboard password")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("names the proxy's user, and leaves signing out to the proxy", async () => {
    const user = userEvent.setup();
    renderHeader({ account: { mode: "proxy", user: "chris@example.com", onSignOut: vi.fn() } });

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("chris@example.com")).toBeTruthy();
    expect(within(dialog).getByText("Through your sign-in proxy")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("has no account section with auth off", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("Account")).toBeNull();
  });
});
