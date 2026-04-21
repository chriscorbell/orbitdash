// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";

afterEach(() => {
  cleanup();
});

function renderHeader(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props: React.ComponentProps<typeof Header> = {
    canReorderCategories: true,
    columnCount: 4,
    isCategoryOrderBusy: false,
    isReorderMode: false,
    servicesFirst: true,
    showServicesSection: true,
    showStatsSection: true,
    onColumnCountChange: vi.fn(),
    onServicesFirstChange: vi.fn(),
    onShowServicesSectionChange: vi.fn(),
    onShowStatsSectionChange: vi.fn(),
    onToggleReorder: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<Header {...props} />),
    props,
  };
}

describe("Header", () => {
  it("opens settings in a dialog and toggles services-first state", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();

    await user.click(screen.getByRole("switch", { name: "Services first" }));

    expect(props.onServicesFirstChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  });

  it("changes the column count from the select control", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(screen.getByRole("combobox", { name: "Column count" }));
    await user.click(screen.getByRole("option", { name: "5 columns" }));

    expect(props.onColumnCountChange).toHaveBeenCalledWith(5);
  });

  it("hides the reorder action when category reordering is unavailable", async () => {
    const user = userEvent.setup();

    renderHeader({ canReorderCategories: false });

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    expect(screen.queryByRole("button", { name: /Reorder categories/i })).toBeNull();
  });
});
