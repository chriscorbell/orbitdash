// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CategorySectionList } from "./CategorySectionList";
import type { Service } from "@shared/types";

const monitoringService: Service = {
  id: "monitoring",
  name: "Grafana",
  url: "https://grafana.example.com",
  description: "Metrics",
  icon: null,
  category: "Monitoring",
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
};

const storageService: Service = {
  ...monitoringService,
  id: "storage",
  name: "TrueNAS",
  url: "https://truenas.example.com",
  category: "Storage",
};

function renderCategoryList() {
  return render(
    <CategorySectionList
      grouped={[
        ["Monitoring", [monitoringService]],
        ["Storage", [storageService]],
      ]}
      gridClassName="grid"
      hasNamedCategories
      services={[monitoringService, storageService]}
      onDelete={vi.fn()}
      onEdit={vi.fn()}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("CategorySectionList", () => {
  it("collapses one category without hiding the others", () => {
    renderCategoryList();

    fireEvent.click(screen.getByRole("button", { name: "Collapse Monitoring category" }));

    expect(screen.queryByRole("link", { name: /Grafana/ })).toBeNull();
    expect(screen.getByRole("link", { name: /TrueNAS/ })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Expand Monitoring category" })
        .getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("restores collapsed categories from local storage", async () => {
    const view = renderCategoryList();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Monitoring category" }));

    await waitFor(() => {
      expect(window.localStorage.getItem("orbitdash.collapsedCategories")).toBe('["Monitoring"]');
    });

    view.unmount();
    renderCategoryList();

    expect(screen.getByRole("button", { name: "Expand Monitoring category" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Grafana/ })).toBeNull();
  });

  it("keeps the uncategorized-only grid free of disclosure controls", () => {
    render(
      <CategorySectionList
        grouped={[]}
        gridClassName="grid"
        hasNamedCategories={false}
        services={[{ ...monitoringService, category: null }]}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /category/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Grafana/ })).toBeTruthy();
  });
});
