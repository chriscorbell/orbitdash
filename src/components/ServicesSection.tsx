import { lazy, Suspense } from "react";
import { CategorySectionList } from "@/components/services/CategorySectionList";
import { DeleteServiceDialog } from "@/components/services/DeleteServiceDialog";
import { ServicesEmptyState } from "@/components/services/ServicesEmptyState";
import { ServicesSectionFeedback } from "@/components/services/ServicesSectionFeedback";
import { ServicesToolbar } from "@/components/services/ServicesToolbar";
import { useServicesSectionState } from "@/components/services/useServicesSectionState";
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
  const {
    actionError,
    addOpen,
    categoryOptions,
    categoryOrderError,
    deleteTarget,
    deleting,
    draftOrder,
    editingService,
    filteredServices,
    gridClassName,
    groupedServices,
    handleDeleteConfirm,
    handleReorderOpenChange,
    hasNamedCategories,
    isCategoryOrderSaving,
    isReorderMode,
    moveCategory,
    reorderCategories,
    search,
    saveOrder,
    setActionError,
    setAddOpen,
    setDeleteTarget,
    setEditingService,
    setSearch,
    showInitialError,
    showInitialLoading,
    showInlineError,
  } = useServicesSectionState({
    categoryOrder,
    error,
    isFiveColumn,
    loading,
    onDelete,
    services,
  });

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

      <ServicesSectionFeedback
        actionError={actionError}
        categoryOrderError={categoryOrderError}
        error={error}
        isReorderMode={isReorderMode}
        onClearActionError={() => setActionError(null)}
        onRetry={() => {
          void onRetry();
        }}
        showInitialError={showInitialError}
        showInitialLoading={showInitialLoading}
        showInlineError={showInlineError}
      />

      {!showInitialLoading &&
        !showInitialError &&
        filteredServices.length === 0 &&
        services.length === 0 && (
          <ServicesEmptyState mode="empty" onAddService={() => setAddOpen(true)} />
        )}

      {!showInitialLoading && filteredServices.length === 0 && services.length > 0 && (
        <ServicesEmptyState
          mode="search"
          search={search}
          onAddService={() => setAddOpen(true)}
          onClearSearch={() => setSearch("")}
        />
      )}

      {!showInitialLoading && !showInitialError && filteredServices.length > 0 && (
        <CategorySectionList
          grouped={groupedServices}
          gridClassName={gridClassName}
          hasNamedCategories={hasNamedCategories}
          services={filteredServices}
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

      <DeleteServiceDialog
        deleting={deleting}
        onConfirm={handleDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        service={deleteTarget}
      />
    </div>
  );
}
