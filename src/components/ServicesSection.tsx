import { lazy, Suspense, useMemo, useState } from "react";
import { CategorySectionList } from "@/components/services/CategorySectionList";
import { ServicesEmptyState } from "@/components/services/ServicesEmptyState";
import { ServicesToolbar } from "@/components/services/ServicesToolbar";
import { SectionStateCard } from "@/components/common/SectionStateCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";
import type { Service, CreateServicePayload, UpdateServicePayload } from "@shared/types";

const ServiceDialog = lazy(() =>
  import("@/components/ServiceDialog").then((module) => ({
    default: module.ServiceDialog,
  }))
);

const CategoryReorderDialog = lazy(() =>
  import("@/components/services/CategoryReorderDialog").then((module) => ({
    default: module.CategoryReorderDialog,
  }))
);

interface ServicesSectionProps {
  services: Service[];
  categoryOrder: UseCategoryOrderResult;
  loading: boolean;
  error: string | null;
  isFiveColumn: boolean;
  onRetry: () => Promise<void>;
  onCreate: (payload: CreateServicePayload, iconFile?: File) => Promise<Service>;
  onUpdate: (
    id: string,
    payload: UpdateServicePayload,
    iconFile?: File,
    removeIcon?: boolean
  ) => Promise<Service>;
  onDelete: (id: string) => Promise<void>;
}

export function ServicesSection({
  services,
  categoryOrder,
  loading,
  error,
  isFiveColumn,
  onRetry,
  onCreate,
  onUpdate,
  onDelete,
}: ServicesSectionProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const {
    draftOrder,
    error: categoryOrderError,
    hasNamedCategories,
    isReorderMode,
    saving: isCategoryOrderSaving,
    visibleCategoryOrder,
    cancelReorder,
    moveCategory,
    reorderCategories,
    saveOrder,
  } = categoryOrder;

  const filtered = useMemo(() => {
    if (!search.trim()) return services;
    const q = search.toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q)
    );
  }, [services, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Service[]>();
    for (const s of filtered) {
      const cat = s.category?.trim() || UNCATEGORIZED_CATEGORY;
      const list = groups.get(cat) || [];
      list.push(s);
      groups.set(cat, list);
    }
    return visibleCategoryOrder
      .filter((category) => groups.has(category))
      .map((category) => [category, groups.get(category) ?? []] as const);
  }, [filtered, visibleCategoryOrder]);

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];

    for (const service of services) {
      const category = service.category?.trim();
      if (!category || seen.has(category)) continue;
      seen.add(category);
      options.push(category);
    }

    return options.sort((a, b) => a.localeCompare(b));
  }, [services]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Error handling is in the parent
    } finally {
      setDeleting(false);
    }
  };

  const gridClassName = isFiveColumn
    ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
    : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4";
  const handleReorderOpenChange = (open: boolean) => {
    if (!open) {
      cancelReorder();
    }
  };
  const showInitialLoading = loading && services.length === 0;
  const showInitialError = !loading && error !== null && services.length === 0;
  const showInlineError = error !== null && services.length > 0;

  return (
    <div className="space-y-4">
      <ServicesToolbar
        search={search}
        servicesCount={services.length}
        onAddService={() => setAddOpen(true)}
        onSearchChange={setSearch}
      />

      <Suspense fallback={null}>
        <CategoryReorderDialog
          draftOrder={draftOrder}
          error={categoryOrderError}
          open={isReorderMode}
          saving={isCategoryOrderSaving}
          onMoveCategory={moveCategory}
          onOpenChange={handleReorderOpenChange}
          onReorder={reorderCategories}
          onSave={() => void saveOrder()}
        />
      </Suspense>

      {showInlineError && (
        <SectionStateCard
          tone="error"
          title="Services may be stale"
          description={`${error} The last saved list is still visible.`}
          actionLabel="Retry"
          onAction={() => {
            void onRetry();
          }}
        />
      )}

      {showInitialLoading && (
        <SectionStateCard
          tone="loading"
          title="Loading services"
          description="Fetching your saved services and category layout."
        />
      )}

      {showInitialError && (
        <SectionStateCard
          tone="error"
          title="Services are unavailable"
          description={error}
          actionLabel="Retry"
          onAction={() => {
            void onRetry();
          }}
        />
      )}

      {!showInitialLoading &&
        !showInitialError &&
        filtered.length === 0 &&
        services.length === 0 && (
          <ServicesEmptyState mode="empty" onAddService={() => setAddOpen(true)} />
        )}

      {!showInitialLoading && filtered.length === 0 && services.length > 0 && (
        <ServicesEmptyState
          mode="search"
          search={search}
          onAddService={() => setAddOpen(true)}
          onClearSearch={() => setSearch("")}
        />
      )}

      {!showInitialLoading && !showInitialError && filtered.length > 0 && (
        <CategorySectionList
          grouped={grouped}
          gridClassName={gridClassName}
          hasNamedCategories={hasNamedCategories}
          services={filtered}
          onDelete={setDeleteTarget}
          onEdit={setEditingService}
        />
      )}

      {/* Add dialog */}
      <Suspense fallback={null}>
        <ServiceDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          categoryOptions={categoryOptions}
          onSubmit={async (payload, iconFile) => {
            await onCreate(payload, iconFile);
          }}
        />
      </Suspense>

      {/* Edit dialog */}
      <Suspense fallback={null}>
        <ServiceDialog
          open={editingService !== null}
          onOpenChange={(open) => {
            if (!open) {
              setEditingService(null);
            }
          }}
          service={editingService}
          categoryOptions={categoryOptions}
          onSubmit={async (payload, iconFile, removeIcon) => {
            if (!editingService) {
              return;
            }

            await onUpdate(editingService.id, payload, iconFile, removeIcon);
          }}
          onDelete={
            editingService
              ? async () => {
                  await onDelete(editingService.id);
                }
              : undefined
          }
        />
      </Suspense>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete service</DialogTitle>
            <DialogDescription>
              Confirm service deletion before removing it permanently.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This cannot
            be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
