// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/header/AppHeader";
import { createQueryWrapper } from "@/test/query";

vi.mock("@/lib/api/system", () => ({
  fetchSystemInfo: vi.fn().mockResolvedValue({
    cpuCount: 4,
    hostname: "nas",
    platform: "linux",
    uptimeSeconds: 3 * 86_400 + 5 * 3_600,
  }),
}));

afterEach(() => cleanup());

function renderHeader(search = "") {
  const props = {
    search,
    onAddService: vi.fn(),
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

    expect(await screen.findByText("nas")).toBeTruthy();
    expect(screen.getByText("up 3d 5h")).toBeTruthy();
  });
});
