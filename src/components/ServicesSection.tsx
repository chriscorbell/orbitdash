import { lazy, Suspense } from "react";
import { CategorySectionList } from "@/components/services/CategorySectionList";
import { DeleteServiceDialog } from "@/components/services/DeleteServiceDialog";
import { ServicesEmptyState } from "@/components/services/ServicesEmptyState";
import { ServicesSectionFeedback } from "@/components/services/ServicesSectionFeedback";
import { ServicesToolbar } from "@/components/services/ServicesToolbar";
import { useServicesSectionState } from "@/components/services/useServicesSectionState";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";
import type {
  Service,
  CreateServicePayload,
  RenameCategoryResponse,
  UpdateServicePayload,
} from "@shared/types";

const ServiceDialog = lazy(() =>
  import("@/components/ServiceDialog").then((module) => ({
    default: module.ServiceDialog,
  }))
);

const RenameCategoryDialog = lazy(() =>
  import("@/components/services/RenameCategoryDialog").then((module) => ({
    default: module.RenameCategoryDialog,
  }))
);

interface ServicesSectionProps {
  services: Service[];
  categoryOrder: UseCategoryOrderResult;
  loading: boolean;
  error: string | null;
  columnCount: 3 | 4 | 5;
  onRetry: () => Promise<void>;
  onCreate: (payload: CreateServicePayload, iconFile?: File) => Promise<Service>;
  onUpdate: (
    id: string,
    payload: UpdateServicePayload,
    iconFile?: File,
    removeIcon?: boolean
  ) => Promise<Service>;
  onDelete: (id: string) => Promise<void>;
  onRenameCategory: (from: string, to: string) => Promise<RenameCategoryResponse>;
}

export function ServicesSection({
  services,
  categoryOrder,
  loading,
  error,
  columnCount,
  onRetry,
  onCreate,
  onUpdate,
  onDelete,
  onRenameCategory,
}: ServicesSectionProps) {
  const {
    actionError,
    addOpen,
    categoryOptions,
    categoryOrderError,
    deleteTarget,
    deleting,
    editingService,
    filteredServices,
    gridClassName,
    groupedServices,
    handleDeleteConfirm,
    handleRenameCategoryConfirm,
    hasNamedCategories,
    isReorderMode,
    renameCategoryTarget,
    search,
    setActionError,
    setAddOpen,
    setDeleteTarget,
    setEditingService,
    setRenameCategoryTarget,
    setSearch,
    showInitialError,
    showInitialLoading,
    showInlineError,
  } = useServicesSectionState({
    categoryOrder,
    columnCount,
    error,
    loading,
    onDelete,
    onRenameCategory,
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
          onRenameCategory={setRenameCategoryTarget}
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

      <Suspense fallback={null}>
        <RenameCategoryDialog
          category={renameCategoryTarget}
          onOpenChange={(open) => {
            if (!open) {
              setRenameCategoryTarget(null);
            }
          }}
          onRename={handleRenameCategoryConfirm}
        />
      </Suspense>
    </div>
  );
}
