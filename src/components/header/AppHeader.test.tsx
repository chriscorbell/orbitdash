// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/header/AppHeader";
import {
  preloadEditableBoard,
  preloadSettingsDialog,
} from "@/components/settings/settings-preload";
import { createQueryWrapper } from "@/test/query";

// The real preloads import whole lazy chunks, which can finish after the test environment is torn
// down and fail the run.
vi.mock("@/components/settings/settings-preload", () => ({
  preloadEditableBoard: vi.fn(),
  preloadSettingsDialog: vi.fn(),
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

function renderHeader(search = "", options: { editing?: boolean; canEditLayout?: boolean } = {}) {
  const props = {
    editing: options.editing ?? false,
    search,
    canEditLayout: options.canEditLayout ?? true,
    onAddService: vi.fn(),
    onDoneEditing: vi.fn(),
    onEditLayout: vi.fn(),
    onNewCategory: vi.fn(),
    onOpenSettings: vi.fn(),
    onSearchChange: vi.fn(),
  };
  render(<AppHeader {...props} />, { wrapper: createQueryWrapper().wrapper });
  return props;
}

describe("AppHeader", () => {
  it("focuses search with Ctrl+K or / but not while typing elsewhere", () => {
    renderHeader();
    const search = screen.getByRole("searchbox", { name: "Search services" });

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(search);

    search.blur();
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(search);

    const other = document.createElement("input");
    document.body.appendChild(other);
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it("clears the search with the button or Escape", async () => {
    const user = userEvent.setup();
    const props = renderHeader("jelly");

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(props.onSearchChange).toHaveBeenCalledWith("");

    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(props.onSearchChange).toHaveBeenCalledTimes(2);
  });

  it("opens add and settings, and shows the host's name and uptime", async () => {
    const user = userEvent.setup();
    const props = renderHeader();

    await user.click(screen.getByRole("button", { name: "Add service" }));
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(props.onAddService).toHaveBeenCalled();
    expect(props.onOpenSettings).toHaveBeenCalled();
    expect(preloadSettingsDialog).toHaveBeenCalled();

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
    renderHeader("", { canEditLayout: false });
    expect(screen.queryByRole("button", { name: "Edit layout" })).toBeNull();
  });

  it("swaps search for the editing controls in edit mode", async () => {
    const user = userEvent.setup();
    const props = renderHeader("", { editing: true });

    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByText("Editing layout")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "New category" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(props.onNewCategory).toHaveBeenCalledTimes(1);
    expect(props.onDoneEditing).toHaveBeenCalledTimes(1);
  });
});
