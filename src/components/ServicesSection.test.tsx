// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ServiceDialog", () => ({
  ServiceDialog: () => null,
}));

vi.mock("@/components/services/CategoryReorderDialog", () => ({
  CategoryReorderDialog: () => null,
}));

import { ServicesSection } from "@/components/ServicesSection";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";
import type { Service } from "@shared/types";

const categoryOrderStub: UseCategoryOrderResult = {
  draftOrder: [],
  error: null,
  hasNamedCategories: false,
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

const baseService: Service = {
  id: "svc-1",
  name: "Orbit",
  url: "https://example.com/orbit",
  description: "Dashboard",
  icon: null,
  category: "Monitoring",
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
};

function renderServicesSection(
  overrides: Partial<React.ComponentProps<typeof ServicesSection>> = {}
) {
  return render(
    <ServicesSection
      services={[]}
      categoryOrder={categoryOrderStub}
      loading={false}
      error={null}
      isFiveColumn={false}
      onRetry={vi.fn().mockResolvedValue(undefined)}
      onCreate={vi.fn().mockResolvedValue(baseService)}
      onUpdate={vi.fn().mockResolvedValue(baseService)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />
  );
}

describe("ServicesSection", () => {
  it("shows a loading state before the initial service list arrives", () => {
    renderServicesSection({ loading: true });

    expect(screen.getByText("Loading services")).toBeTruthy();
    expect(screen.getByText("Fetching your saved services and category layout.")).toBeTruthy();
  });

  it("shows a retryable error state when the initial service load fails", () => {
    renderServicesSection({ error: "Failed to load services" });

    expect(screen.getByText("Services are unavailable")).toBeTruthy();
    expect(screen.getByText("Failed to load services")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("shows a non-blocking stale-data warning when services already exist", () => {
    renderServicesSection({ services: [baseService], error: "Refresh failed" });

    expect(screen.getByText("Services may be stale")).toBeTruthy();
    expect(screen.getByText("Refresh failed The last saved list is still visible.")).toBeTruthy();
    expect(screen.getByText("Orbit")).toBeTruthy();
  });
});
