// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";

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
  saving: false,
  visibleCategoryOrder: [],
  beginReorder: vi.fn(),
  cancelReorder: vi.fn(),
  moveCategory: vi.fn(),
  reorderCategories: vi.fn(),
  saveOrder: vi.fn().mockResolvedValue(undefined),
};

function renderHeader(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props: React.ComponentProps<typeof Header> = {
    categoryOrder: categoryOrderStub,
    columnCount: 4,
    servicesFirst: true,
    showServicesSection: true,
    showStatsSection: true,
    onColumnCountChange: vi.fn(),
    onServicesFirstChange: vi.fn(),
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
    expect(screen.getByText("Web")).toBeTruthy();
    expect(screen.getByText("Homelab")).toBeTruthy();
  });
});
