// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/header/AppHeader";
import { preloadEditableBoard, preloadSettingsPage } from "@/components/settings/settings-preload";
import { createQueryWrapper } from "@/test/query";

// The real preloads import whole lazy chunks, which can finish after the test environment is torn
// down and fail the run.
vi.mock("@/components/settings/settings-preload", () => ({
  preloadEditableBoard: vi.fn(),
  preloadSettingsPage: vi.fn(),
}));

vi.mock("@/lib/api/system", () => ({
  fetchSystemInfo: vi.fn().mockResolvedValue({
    cpuCount: 4,
    hostname: "nas",
    platform: "linux",
    uptimeSeconds: 3 * 86_400 + 5 * 3_600,
  }),
}));

afterEach(() => cleanup());

function renderHeader(
  options: { editing?: boolean; canEdit?: boolean; canEditLayout?: boolean; signIn?: boolean } = {}
) {
  const props = {
    canEdit: options.canEdit,
    editing: options.editing ?? false,
    canEditLayout: options.canEditLayout ?? true,
    onAddService: vi.fn(),
    onDoneEditing: vi.fn(),
    onEditLayout: vi.fn(),
    onNewCategory: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenPalette: vi.fn(),
    onPreloadPalette: vi.fn(),
    onSignIn: options.signIn ? vi.fn() : undefined,
  };
  render(<AppHeader {...props} />, { wrapper: createQueryWrapper().wrapper });
  return props;
}

describe("AppHeader", () => {
  it("opens the command palette from the search field and loads it early on hover", async () => {
    const user = userEvent.setup();
    const props = renderHeader();
    const trigger = screen.getByRole("button", { name: "Search services and commands" });

    await user.hover(trigger);
    expect(props.onPreloadPalette).toHaveBeenCalled();
    await user.click(trigger);
    expect(props.onOpenPalette).toHaveBeenCalledTimes(1);
  });

  it("opens add and settings, and shows the host's name and uptime", async () => {
    const user = userEvent.setup();
    const props = renderHeader();

    await user.click(screen.getByRole("button", { name: "Add service" }));
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(props.onAddService).toHaveBeenCalled();
    expect(props.onOpenSettings).toHaveBeenCalled();
    expect(preloadSettingsPage).toHaveBeenCalled();

    expect(await screen.findByText("nas")).toBeTruthy();
    expect(screen.getByText("up 3d 5h")).toBeTruthy();
  });

  it("enters edit mode from the header, and only when the board is shown", async () => {
    const user = userEvent.setup();
    const props = renderHeader();

    await user.click(screen.getByRole("button", { name: "Edit layout" }));
    expect(props.onEditLayout).toHaveBeenCalledTimes(1);
    expect(preloadEditableBoard).toHaveBeenCalled();

    cleanup();
    renderHeader({ canEditLayout: false });
    expect(screen.queryByRole("button", { name: "Edit layout" })).toBeNull();
  });

  it("swaps search for the editing controls in edit mode", async () => {
    const user = userEvent.setup();
    const props = renderHeader({ editing: true });

    expect(screen.queryByRole("button", { name: "Search services and commands" })).toBeNull();
    expect(screen.getByText("Editing layout")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "New category" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(props.onNewCategory).toHaveBeenCalledTimes(1);
    expect(props.onDoneEditing).toHaveBeenCalledTimes(1);
  });
  it("gives guests a sign-in button instead of add, edit and settings", async () => {
    const user = userEvent.setup();
    const props = renderHeader({ canEdit: false, signIn: true });

    for (const name of ["Add service", "Edit layout", "Open settings"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.getByRole("button", { name: "Search services and commands" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(props.onSignIn).toHaveBeenCalled();

    cleanup();
    renderHeader({ canEdit: false });
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });
});
