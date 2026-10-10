// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";

vi.mock("@/components/settings/BackupSettingsSection", () => ({
  BackupSettingsSection: () => <div data-testid="backup-settings" />,
}));

afterEach(() => {
  cleanup();
});

const categoryOrderStub: UseCategoryOrderResult = {
  draftOrder: [],
  error: null,
  hasNamedCategories: false,
  isDirty: false,
  isReorderMode: false,
  loading: false,
  namedCategories: [],
  saveState: "idle",
  saving: false,
  visibleCategoryOrder: [],
  applyOrder: vi.fn(),
  beginReorder: vi.fn(),
  cancelReorder: vi.fn(),
  moveCategory: vi.fn().mockResolvedValue(undefined),
  reorderCategories: vi.fn().mockResolvedValue(undefined),
  saveOrder: vi.fn().mockResolvedValue(undefined),
};

function renderHeader(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props: React.ComponentProps<typeof Header> = {
    categoryOrder: categoryOrderStub,
    columnCount: 4,
    servicesFirst: true,
    settingsScope: "all",
    showServicesSection: true,
    showStatsSection: true,
    onColumnCountChange: vi.fn(),
    onServicesFirstChange: vi.fn(),
    onSettingsScopeChange: vi.fn(),
    onShowServicesSectionChange: vi.fn(),
    onShowStatsSectionChange: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<Header {...props} />),
    props,
  };
}

describe("Header", () => {
  it("switches between shared and per-device settings", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("button", { name: "All devices" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByText("Visibility and layout changes apply to every browser.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "This device" }));
    expect(props.onSettingsScopeChange).toHaveBeenCalledWith("device");
  });

  it("explains per-device scope and shows save errors", async () => {
    const user = userEvent.setup();
    renderHeader({ settingsScope: "device", settingsError: "Failed to save settings" });

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    expect(
      screen.getByText("Visibility and layout changes apply only to this browser.")
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

  it("changes the section order via button group", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader({ servicesFirst: true });

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(screen.getByRole("button", { name: "Stats → Services" }));

    expect(props.onServicesFirstChange).toHaveBeenCalledWith(false);
  });

  it("changes the column count via button group", async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(screen.getByRole("button", { name: "5 columns" }));

    expect(props.onColumnCountChange).toHaveBeenCalledWith(5);
  });

  it("hides the category order section when fewer than 2 named categories", async () => {
    const user = userEvent.setup();

    renderHeader({
      categoryOrder: { ...categoryOrderStub, namedCategories: ["Only"] },
    });

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    expect(screen.queryByText("Category order")).toBeNull();
  });

  it("shows the category order section when 2 or more named categories exist", async () => {
    const user = userEvent.setup();

    renderHeader({
      categoryOrder: {
        ...categoryOrderStub,
        namedCategories: ["Web", "Homelab"],
        draftOrder: ["Web", "Homelab"],
      },
    });

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    expect(screen.getByText("Category order")).toBeTruthy();
    // The sortable list is lazily loaded with dnd-kit.
    expect(await screen.findByText("Web")).toBeTruthy();
    expect(screen.getByText("Homelab")).toBeTruthy();
  });

  function reorderableCategoryOrder(
    overrides: Partial<UseCategoryOrderResult> = {}
  ): UseCategoryOrderResult {
    return {
      ...categoryOrderStub,
      namedCategories: ["Web", "Homelab"],
      draftOrder: ["Web", "Homelab"],
      beginReorder: vi.fn(),
      cancelReorder: vi.fn(),
      moveCategory: vi.fn().mockResolvedValue(undefined),
      saveOrder: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it("saves category moves right away instead of when settings close", async () => {
    const user = userEvent.setup();
    const categoryOrder = reorderableCategoryOrder({ isDirty: true });
    renderHeader({ categoryOrder });

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(categoryOrder.beginReorder).toHaveBeenCalledTimes(1);

    await user.click(await screen.findByRole("button", { name: "Move Homelab up" }));
    expect(categoryOrder.moveCategory).toHaveBeenCalledWith("Homelab", "up");

    await user.keyboard("{Escape}");
    expect(categoryOrder.cancelReorder).toHaveBeenCalled();
    expect(categoryOrder.saveOrder).not.toHaveBeenCalled();
  });

  it("shows when the category order has been saved", async () => {
    const user = userEvent.setup();
    renderHeader({ categoryOrder: reorderableCategoryOrder({ saveState: "saved" }) });

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    expect(screen.getByText("Saved").closest("[role=status]")).toBeTruthy();
  });

  it("shows save errors with a retry", async () => {
    const user = userEvent.setup();
    const categoryOrder = reorderableCategoryOrder({
      error: "Failed to save category order",
      saveState: "error",
    });
    renderHeader({ categoryOrder });

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    expect(screen.getByRole("alert").textContent).toBe("Failed to save category order");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(categoryOrder.saveOrder).toHaveBeenCalledTimes(1);
  });

  it("does not offer a retry for load errors", async () => {
    const user = userEvent.setup();
    renderHeader({
      categoryOrder: reorderableCategoryOrder({ error: "Failed to fetch category order" }),
    });

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    expect(screen.getByRole("alert").textContent).toBe("Failed to fetch category order");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("moves categories from the lazily loaded category order list", async () => {
    const user = userEvent.setup();
    const moveCategory = vi.fn();

    renderHeader({
      categoryOrder: {
        ...categoryOrderStub,
        namedCategories: ["Web", "Homelab"],
        draftOrder: ["Web", "Homelab"],
        moveCategory,
      },
    });

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(await screen.findByRole("button", { name: "Move Homelab up" }));

    expect(moveCategory).toHaveBeenCalledWith("Homelab", "up");
    expect(screen.getByRole("button", { name: "Move Web up" }).hasAttribute("disabled")).toBe(true);
  });
});
