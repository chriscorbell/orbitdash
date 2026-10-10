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
  category_id: "cat-monitoring",
  position: 0,
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
  category_id: "cat-storage",
  position: 0,
};

function renderCategoryList(monitoringName = "Monitoring") {
  return render(
    <CategorySectionList
      grouped={[
        { key: "cat-monitoring", name: monitoringName, services: [monitoringService] },
        { key: "cat-storage", name: "Storage", services: [storageService] },
      ]}
      gridClassName="grid"
      hasNamedCategories
      services={[monitoringService, storageService]}
      onDelete={vi.fn()}
      onDuplicate={vi.fn()}
      onEdit={vi.fn()}
      onRenameCategory={vi.fn()}
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
      expect(window.localStorage.getItem("orbitdash.collapsedCategoryIds")).toBe(
        '["cat-monitoring"]'
      );
    });

    view.unmount();
    renderCategoryList();

    expect(screen.getByRole("button", { name: "Expand Monitoring category" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Grafana/ })).toBeNull();
  });

  it("keeps a category collapsed after it is renamed", () => {
    const view = renderCategoryList();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Monitoring category" }));
    view.unmount();

    renderCategoryList("Observability");

    expect(screen.getByRole("button", { name: "Expand Observability category" })).toBeTruthy();
  });

  it("migrates collapsed categories saved by name in older versions", () => {
    window.localStorage.setItem("orbitdash.collapsedCategories", '["Storage","Gone"]');

    renderCategoryList();

    expect(screen.getByRole("button", { name: "Expand Storage category" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse Monitoring category" })).toBeTruthy();
    expect(window.localStorage.getItem("orbitdash.collapsedCategories")).toBeNull();
  });

  it("ignores an unreadable legacy collapsed list", () => {
    window.localStorage.setItem("orbitdash.collapsedCategories", "{not json");

    renderCategoryList();

    expect(screen.getByRole("button", { name: "Collapse Storage category" })).toBeTruthy();
  });

  it("keeps the uncategorized-only grid free of disclosure controls", () => {
    render(
      <CategorySectionList
        grouped={[]}
        gridClassName="grid"
        hasNamedCategories={false}
        services={[{ ...monitoringService, category: null }]}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onEdit={vi.fn()}
        onRenameCategory={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /category/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Grafana/ })).toBeTruthy();
  });
});
