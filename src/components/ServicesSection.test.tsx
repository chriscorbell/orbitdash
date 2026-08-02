// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ServiceDialog", () => ({
  ServiceDialog: () => null,
}));

vi.mock("@/components/services/CategoryReorderDialog", () => ({
  CategoryReorderDialog: () => null,
}));

vi.mock("@/components/services/CategorySectionList", () => ({
  CategorySectionList: ({
    services,
    onDelete,
  }: {
    services: Service[];
    onDelete: (service: Service) => void;
  }) => (
    <div>
      {services.map((service) => (
        <div key={service.id}>
          <span>{service.name}</span>
          <button type="button" onClick={() => onDelete(service)}>
            Delete {service.name}
          </button>
        </div>
      ))}
    </div>
  ),
}));

import { ServicesSection } from "@/components/ServicesSection";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";
import type { Service } from "@shared/types";

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
  applyOrder: vi.fn(),
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
      columnCount={4}
      onRetry={vi.fn().mockResolvedValue(undefined)}
      onCreate={vi.fn().mockResolvedValue(baseService)}
      onUpdate={vi.fn().mockResolvedValue(baseService)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      onDuplicate={vi.fn().mockResolvedValue(baseService)}
      onRenameCategory={vi.fn().mockResolvedValue({ services: [], order: [] })}
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

  it("shows category order load errors outside the reorder dialog", () => {
    renderServicesSection({
      categoryOrder: {
        ...categoryOrderStub,
        error: "Failed to load category order",
      },
    });

    expect(screen.getByText("Category ordering is unavailable")).toBeTruthy();
    expect(screen.getByText("Failed to load category order")).toBeTruthy();
  });

  it("surfaces delete confirmation failures in the section UI", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("Delete failed"));

    renderServicesSection({ services: [baseService], onDelete });

    fireEvent.click(screen.getByRole("button", { name: "Delete Orbit" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Service action failed")).toBeTruthy();
    });

    expect(screen.getByText("Delete failed")).toBeTruthy();
  });
});
