import { lazy, Suspense, useCallback } from "react";
import { CategorySectionList } from "@/components/services/CategorySectionList";
import { ServicesEmptyState } from "@/components/services/ServicesEmptyState";
import { ServicesSectionFeedback } from "@/components/services/ServicesSectionFeedback";
import { ServicesToolbar } from "@/components/services/ServicesToolbar";
import { useServicesSectionState } from "@/components/services/useServicesSectionState";
import { toast, toastError } from "@/lib/toast";
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
  onRestore: (id: string) => Promise<Service>;
  onDuplicate: (id: string) => Promise<Service>;
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
  onRestore,
  onDuplicate,
  onRenameCategory,
}: ServicesSectionProps) {
  const {
    addOpen,
    categoryOptions,
    categoryOrderError,
    editingService,
    filteredServices,
    gridClassName,
    groupedServices,
    handleDelete,
    handleDuplicate,
    handleRenameCategoryConfirm,
    hasNamedCategories,
    isReorderMode,
    renameCategoryTarget,
    search,
    setAddOpen,
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
    onRestore,
    onDuplicate,
    onRenameCategory,
    services,
  });

  const handleDeleteCard = useCallback(
    (service: Service) => {
      handleDelete(service).catch((deleteError) =>
        toastError(deleteError, "Couldn't delete the service")
      );
    },
    [handleDelete]
  );

  const handleDuplicateCard = useCallback(
    (service: Service) => {
      void handleDuplicate(service);
    },
    [handleDuplicate]
  );

  return (
    <div className="space-y-4">
      <ServicesToolbar
        search={search}
        servicesCount={services.length}
        onAddService={() => setAddOpen(true)}
        onSearchChange={setSearch}
      />

      <ServicesSectionFeedback
        categoryOrderError={categoryOrderError}
        error={error}
        isReorderMode={isReorderMode}
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
          onDelete={handleDeleteCard}
          onDuplicate={handleDuplicateCard}
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
            const created = await onCreate(payload, iconFile);
            toast({ title: `Added ${created.name}`, tone: "success" });
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
            toast({ title: "Changes saved", tone: "success" });
          }}
          onDelete={
            editingService
              ? async () => {
                  await handleDelete(editingService);
                }
              : undefined
          }
        />
      </Suspense>

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
