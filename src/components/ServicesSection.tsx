import { lazy, Suspense } from "react";
import { CategorySectionList, ServiceGrid } from "@/components/services/CategorySectionList";
import { ServicesEmptyState } from "@/components/services/ServicesEmptyState";
import { ServicesSectionFeedback } from "@/components/services/ServicesSectionFeedback";
import { useServicesSectionState } from "@/components/services/useServicesSectionState";
import { loadEditableBoard } from "@/components/settings/settings-preload";
import type { UseCategoriesResult } from "@/hooks/useCategories";
import type { ServiceMove } from "@/lib/board-groups";
import type { LinkTarget } from "@/lib/link-target";
import { toast } from "@/lib/toast";
import type { BoardMode, CardDensity } from "@shared/dashboard-settings";
import type { CreateServicePayload, Service, UpdateServicePayload } from "@shared/types";

const ServiceDialog = lazy(() =>
  import("@/components/ServiceDialog").then((module) => ({
    default: module.ServiceDialog,
  }))
);

const EditableBoard = lazy(() =>
  loadEditableBoard().then((module) => ({ default: module.EditableBoard }))
);

const DeleteCategoryDialog = lazy(() =>
  import("@/components/board/DeleteCategoryDialog").then((module) => ({
    default: module.DeleteCategoryDialog,
  }))
);

interface ServicesSectionProps {
  services: Service[];
  categories: UseCategoriesResult;
  loading: boolean;
  error: string | null;
  density: CardDensity;
  mode: BoardMode;
  /** Which URL cards open when a service has an external one too. */
  linkTarget: LinkTarget;
  editing: boolean;
  /** Guests see the board but nothing that changes it, and the service dialogs never load. */
  readOnly?: boolean;
  renamingKey: string | null;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  onRenamingKeyChange: (key: string | null) => void;
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
  onMove: (move: ServiceMove) => Promise<Service>;
}

export function ServicesSection({
  services,
  categories,
  loading,
  error,
  density,
  mode,
  linkTarget,
  editing,
  readOnly = false,
  renamingKey,
  addOpen,
  onAddOpenChange,
  onRenamingKeyChange,
  onRetry,
  onCreate,
  onUpdate,
  onDelete,
  onRestore,
  onDuplicate,
  onMove,
}: ServicesSectionProps) {
  const {
    addCategory,
    categoryOptions,
    deleteCategory,
    deleteCategoryTarget,
    editingService,
    groups,
    handleAddToGroup,
    handleDelete,
    handleDeleteCard,
    handleDeleteCategory,
    handleDuplicate,
    handleMove,
    handleRenameCategory,
    handleReorderCategories,
    setAddCategory,
    setDeleteCategoryTarget,
    setEditingService,
    showInitialError,
    showInitialLoading,
    showInlineError,
  } = useServicesSectionState({
    categories,
    editing,
    error,
    loading,
    services,
    onAddOpenChange,
    onDelete,
    onDuplicate,
    onMove,
    onRestore,
  });

  const hasCategories = groups.some((group) => group.categoryId !== null);
  const showBoard = !showInitialLoading && !showInitialError && groups.length > 0;
  const readOnlyBoard = hasCategories ? (
    <CategorySectionList density={density} groups={groups} linkTarget={linkTarget} mode={mode} />
  ) : (
    <ServiceGrid density={density} linkTarget={linkTarget} services={services} />
  );

  return (
    <div className="space-y-4">
      <h2 className="sr-only">Services</h2>

      <ServicesSectionFeedback
        categoriesError={categories.error}
        density={density}
        error={error}
        onRetry={() => {
          void onRetry();
        }}
        showInitialError={showInitialError}
        showInitialLoading={showInitialLoading}
        showInlineError={showInlineError}
      />

      {!showInitialLoading && !showInitialError && services.length === 0 && groups.length === 0 && (
        <ServicesEmptyState onAddService={readOnly ? undefined : () => onAddOpenChange(true)} />
      )}

      {showBoard &&
        (editing ? (
          // The read-only board stands in while the editor's code downloads, so nothing jumps.
          <Suspense fallback={readOnlyBoard}>
            <EditableBoard
              categories={categories.categories}
              density={density}
              groups={groups}
              linkTarget={linkTarget}
              mode={mode}
              renamingKey={renamingKey}
              onAddService={handleAddToGroup}
              onDeleteCategory={handleDeleteCategory}
              onDeleteService={handleDeleteCard}
              onDuplicateService={(service) => void handleDuplicate(service)}
              onEditService={setEditingService}
              onMoveService={handleMove}
              onRenameCategory={handleRenameCategory}
              onRenamingKeyChange={onRenamingKeyChange}
              onReorderCategories={handleReorderCategories}
            />
          </Suspense>
        ) : (
          services.length > 0 && readOnlyBoard
        ))}

      {!readOnly && (
        <>
          {/* Add dialog */}
          <Suspense fallback={null}>
            <ServiceDialog
              open={addOpen}
              onOpenChange={(open) => {
                onAddOpenChange(open);
                if (!open) setAddCategory(null);
              }}
              categoryOptions={categoryOptions}
              defaultCategory={addCategory}
              services={services}
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
              services={services}
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
        </>
      )}

      {deleteCategoryTarget && (
        <Suspense fallback={null}>
          <DeleteCategoryDialog
            group={deleteCategoryTarget}
            onConfirm={(group) => void deleteCategory(group)}
            onOpenChange={(open) => {
              if (!open) setDeleteCategoryTarget(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
