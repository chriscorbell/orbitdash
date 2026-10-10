import { lazy, Suspense, useCallback } from "react";
import { CategorySectionList } from "@/components/services/CategorySectionList";
import { ServicesEmptyState } from "@/components/services/ServicesEmptyState";
import { ServicesSectionFeedback } from "@/components/services/ServicesSectionFeedback";
import { useServicesSectionState } from "@/components/services/useServicesSectionState";
import { toast, toastError } from "@/lib/toast";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";
import type { BoardMode, CardDensity } from "@shared/dashboard-settings";
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
  density: CardDensity;
  mode: BoardMode;
  search: string;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  onSearchChange: (value: string) => void;
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
  density,
  mode,
  search,
  addOpen,
  onAddOpenChange,
  onSearchChange,
  onRetry,
  onCreate,
  onUpdate,
  onDelete,
  onRestore,
  onDuplicate,
  onRenameCategory,
}: ServicesSectionProps) {
  const {
    categoryOptions,
    categoryOrderError,
    editingService,
    filteredServices,
    groupedServices,
    handleDelete,
    handleDuplicate,
    handleRenameCategoryConfirm,
    hasNamedCategories,
    isReorderMode,
    renameCategoryTarget,
    setEditingService,
    setRenameCategoryTarget,
    showInitialError,
    showInitialLoading,
    showInlineError,
  } = useServicesSectionState({
    categoryOrder,
    error,
    loading,
    onDelete,
    search,
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
      <h2 className="sr-only">Services</h2>

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
          <ServicesEmptyState mode="empty" onAddService={() => onAddOpenChange(true)} />
        )}

      {!showInitialLoading && filteredServices.length === 0 && services.length > 0 && (
        <ServicesEmptyState
          mode="search"
          search={search}
          onAddService={() => onAddOpenChange(true)}
          onClearSearch={() => onSearchChange("")}
        />
      )}

      {!showInitialLoading && !showInitialError && filteredServices.length > 0 && (
        <CategorySectionList
          grouped={groupedServices}
          density={density}
          hasNamedCategories={hasNamedCategories}
          mode={mode}
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
          onOpenChange={onAddOpenChange}
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
