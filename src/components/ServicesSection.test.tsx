// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditableBoardProps } from "@/components/board/EditableBoard";

const dialogProps = vi.hoisted(
  () => [] as Array<{ open: boolean; defaultCategory?: string | null }>
);

vi.mock("@/components/ServiceDialog", () => ({
  ServiceDialog: (props: { open: boolean; defaultCategory?: string | null }) => {
    dialogProps.push(props);
    return null;
  },
}));

// A stand-in for the lazily loaded edit board that exposes its callbacks as buttons.
vi.mock("@/components/settings/settings-preload", () => ({
  loadEditableBoard: async () => ({
    EditableBoard: ({
      groups,
      onAddService,
      onDeleteCategory,
      onDeleteService,
      onMoveService,
      onRenameCategory,
      onReorderCategories,
    }: EditableBoardProps) => (
      <div data-testid="editable-board">
        {groups.map((group) => (
          <div key={group.key}>
            <span>{group.name}</span>
            <button type="button" onClick={() => onAddService(group)}>
              Add to {group.name}
            </button>
            <button type="button" onClick={() => onDeleteCategory(group)}>
              Delete {group.name} category
            </button>
            {group.services.map((service) => (
              <button key={service.id} type="button" onClick={() => onDeleteService(service)}>
                Delete {service.name}
              </button>
            ))}
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onMoveService({ id: "svc-1", categoryId: null, categoryName: null, index: 0 })
          }
        >
          Move Orbit
        </button>
        <button type="button" onClick={() => onRenameCategory("cat-monitoring", "Ops")}>
          Rename Monitoring
        </button>
        <button type="button" onClick={() => onReorderCategories(["b", "a"])}>
          Reorder
        </button>
      </div>
    ),
  }),
}));

import { ServicesSection } from "@/components/ServicesSection";
import { Toaster } from "@/components/ui/toaster";
import type { UseCategoriesResult } from "@/hooks/useCategories";
import { resetToastsForTesting } from "@/lib/toast";
import type { Category, Service } from "@shared/types";

afterEach(() => {
  act(() => resetToastsForTesting());
  cleanup();
  dialogProps.length = 0;
});

const monitoring: Category = {
  id: "cat-monitoring",
  name: "Monitoring",
  position: 0,
  created_at: 1,
  updated_at: 1,
};
const empty: Category = { ...monitoring, id: "cat-empty", name: "Empty", position: 1 };

function categoriesStub(overrides: Partial<UseCategoriesResult> = {}): UseCategoriesResult {
  return {
    categories: [monitoring, empty],
    loading: false,
    error: null,
    create: vi.fn(),
    rename: vi.fn().mockResolvedValue(monitoring),
    remove: vi.fn().mockResolvedValue(undefined),
    reorder: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const baseService: Service = {
  id: "svc-1",
  name: "Orbit",
  url: "https://example.com/orbit",
  description: "Dashboard",
  icon: null,
  icon_source_url: null,
  category: "Monitoring",
  category_id: "cat-monitoring",
  position: 0,
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
};

function renderServicesSection(
  overrides: Partial<React.ComponentProps<typeof ServicesSection>> = {}
) {
  return render(
    <>
      <Toaster />
      <ServicesSection
        services={[]}
        categories={categoriesStub()}
        loading={false}
        error={null}
        density="comfortable"
        mode="columns"
        editing={false}
        renamingKey={null}
        addOpen={false}
        onAddOpenChange={vi.fn()}
        onRenamingKeyChange={vi.fn()}
        onRetry={vi.fn().mockResolvedValue(undefined)}
        onCreate={vi.fn().mockResolvedValue(baseService)}
        onUpdate={vi.fn().mockResolvedValue(baseService)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onRestore={vi.fn().mockResolvedValue(baseService)}
        onDuplicate={vi.fn().mockResolvedValue(baseService)}
        onMove={vi.fn().mockResolvedValue(baseService)}
        {...overrides}
      />
    </>
  );
}

describe("ServicesSection", () => {
  it("shows a loading state before services and categories arrive", () => {
    renderServicesSection({ loading: true });
    expect(screen.getByRole("status").textContent).toBe("Loading services");

    cleanup();
    renderServicesSection({ categories: categoriesStub({ loading: true }), density: "tiles" });
    expect(screen.getByRole("status").textContent).toBe("Loading services");
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
    expect(screen.getByRole("link", { name: /Orbit/ })).toBeTruthy();
  });

  it("reports when categories cannot load", () => {
    renderServicesSection({ categories: categoriesStub({ error: "Failed to load categories" }) });

    expect(screen.getByText("Categories are unavailable")).toBeTruthy();
  });

  it("hides empty categories outside edit mode", () => {
    renderServicesSection({ services: [baseService] });

    expect(screen.getByRole("button", { name: "Collapse Monitoring category" })).toBeTruthy();
    expect(screen.queryByText("Empty")).toBeNull();
  });

  it("asks the app to open the add dialog from the empty state", () => {
    const onAddOpenChange = vi.fn();
    renderServicesSection({ categories: categoriesStub({ categories: [] }), onAddOpenChange });

    fireEvent.click(screen.getByRole("button", { name: /Add your first service/ }));
    expect(onAddOpenChange).toHaveBeenCalledWith(true);
  });

  describe("in edit mode", () => {
    async function renderEditing(
      overrides: Partial<React.ComponentProps<typeof ServicesSection>> = {}
    ) {
      const view = renderServicesSection({ services: [baseService], editing: true, ...overrides });
      await screen.findByTestId("editable-board");
      return view;
    }

    it("shows empty categories as places to drop and add", async () => {
      await renderEditing();
      expect(screen.getByText("Empty")).toBeTruthy();
    });

    it("deletes right away and restores on Undo", async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      const onRestore = vi.fn().mockResolvedValue(baseService);
      await renderEditing({ onDelete, onRestore });

      fireEvent.click(screen.getByRole("button", { name: "Delete Orbit" }));
      expect(onDelete).toHaveBeenCalledWith(baseService.id);

      fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
      expect(onRestore).toHaveBeenCalledWith(baseService.id);
      expect(await screen.findByText("Restored Orbit")).toBeTruthy();
    });

    it("surfaces delete and restore failures as error toasts", async () => {
      const onDelete = vi.fn().mockRejectedValueOnce(new Error("Delete failed"));
      const onRestore = vi.fn().mockRejectedValue(new Error("Too late"));
      await renderEditing({ onDelete, onRestore });

      fireEvent.click(screen.getByRole("button", { name: "Delete Orbit" }));
      expect(await screen.findByText("Couldn't delete the service")).toBeTruthy();
      expect(screen.getByText("Delete failed")).toBeTruthy();

      onDelete.mockResolvedValueOnce(undefined);
      fireEvent.click(screen.getByRole("button", { name: "Delete Orbit" }));
      fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
      expect(await screen.findByText("Couldn't restore the service")).toBeTruthy();
    });

    it("opens the add dialog with the category picked", async () => {
      const onAddOpenChange = vi.fn();
      await renderEditing({ onAddOpenChange });

      fireEvent.click(screen.getByRole("button", { name: "Add to Empty" }));

      expect(onAddOpenChange).toHaveBeenCalledWith(true);
      await waitFor(() => expect(dialogProps.at(-2)?.defaultCategory).toBe("Empty"));
    });

    it("deletes an empty category at once and asks first when it has services", async () => {
      const categories = categoriesStub();
      await renderEditing({ categories });

      fireEvent.click(screen.getByRole("button", { name: "Delete Empty category" }));
      await waitFor(() => expect(categories.remove).toHaveBeenCalledWith("cat-empty"));
      expect(await screen.findByText("Deleted Empty")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Delete Monitoring category" }));
      expect(await screen.findByText("Its service moves to Uncategorized.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Delete category" }));
      await waitFor(() => expect(categories.remove).toHaveBeenCalledWith("cat-monitoring"));
    });

    it("reports failed moves, renames, reorders and category deletes", async () => {
      const categories = categoriesStub({
        rename: vi.fn().mockRejectedValue(new Error("Name taken")),
        reorder: vi.fn().mockRejectedValue(new Error("Offline")),
        remove: vi.fn().mockRejectedValue(new Error("Gone")),
      });
      const onMove = vi.fn().mockRejectedValue(new Error("Nope"));
      await renderEditing({ categories, onMove });

      fireEvent.click(screen.getByRole("button", { name: "Move Orbit" }));
      expect(await screen.findByText("Couldn't move the service")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Rename Monitoring" }));
      expect(await screen.findByText("Couldn't rename the category")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Reorder" }));
      expect(await screen.findByText("Couldn't save the category order")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Delete Empty category" }));
      expect(await screen.findByText("Couldn't delete the category")).toBeTruthy();
    });
  });
});
