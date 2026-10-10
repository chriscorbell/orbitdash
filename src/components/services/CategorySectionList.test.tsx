// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CategorySectionList, ServiceGrid } from "./CategorySectionList";
import type { BoardMode, CardDensity } from "@shared/dashboard-settings";
import type { Service } from "@shared/types";

const monitoringService: Service = {
  id: "monitoring",
  name: "Grafana",
  url: "https://grafana.example.com",
  description: "Metrics",
  icon: null,
  icon_source_url: null,
  category: "Monitoring",
  category_id: "cat-monitoring",
  position: 0,
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
  check_enabled: false,
  check_method: "http",
  check_target: null,
  check_interval: 60,
  check_ignore_tls: false,
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

function renderCategoryList(
  monitoringName = "Monitoring",
  options: { density?: CardDensity; mode?: BoardMode } = {}
) {
  return render(
    <CategorySectionList
      groups={[
        {
          key: "cat-monitoring",
          categoryId: "cat-monitoring",
          name: monitoringName,
          services: [monitoringService],
        },
        {
          key: "cat-storage",
          categoryId: "cat-storage",
          name: "Storage",
          services: [storageService],
        },
      ]}
      density={options.density ?? "comfortable"}
      mode={options.mode ?? "columns"}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockBoardWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
}

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
      <ServiceGrid density="comfortable" services={[{ ...monitoringService, category: null }]} />
    );

    expect(screen.queryByRole("button", { name: /category/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Grafana/ })).toBeTruthy();
  });

  it("lays categories side by side when there is room for columns", () => {
    mockBoardWidth(1232);
    const { container } = renderCategoryList();

    expect(container.querySelector("[data-columns]")?.getAttribute("data-columns")).toBe("2");
  });

  it("stacks category columns into one on a narrow screen", () => {
    mockBoardWidth(360);
    const { container } = renderCategoryList();

    expect(container.querySelector("[data-columns]")?.getAttribute("data-columns")).toBe("1");
  });

  it("stacks categories as rows in the rows layout", () => {
    mockBoardWidth(1232);
    const { container } = renderCategoryList("Monitoring", { mode: "rows" });

    expect(container.querySelector("[data-columns]")).toBeNull();
    expect(screen.getByRole("link", { name: /Grafana/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /TrueNAS/ })).toBeTruthy();
  });

  it("drops descriptions in the compact density but keeps them as a hint", () => {
    renderCategoryList("Monitoring", { density: "compact" });

    expect(screen.queryByText("Metrics")).toBeNull();
    expect(screen.getByRole("link", { name: /Grafana/ }).getAttribute("title")).toBe("Metrics");
  });
});
