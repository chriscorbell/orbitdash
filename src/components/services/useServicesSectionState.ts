import { useCallback, useMemo, useState } from "react";
import type { UseCategoriesResult } from "@/hooks/useCategories";
import { buildBoardGroups, type BoardGroup, type ServiceMove } from "@/lib/board-groups";
import { toast, toastError } from "@/lib/toast";
import type { Service } from "@shared/types";

interface UseServicesSectionStateOptions {
  categories: UseCategoriesResult;
  editing: boolean;
  error: string | null;
  loading: boolean;
  services: Service[];
  onAddOpenChange: (open: boolean) => void;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<Service>;
  onMove: (move: ServiceMove) => Promise<Service>;
  onRestore: (id: string) => Promise<Service>;
}

export function useServicesSectionState({
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
}: UseServicesSectionStateOptions) {
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [addCategory, setAddCategory] = useState<string | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<BoardGroup | null>(null);

  // Edit mode shows empty categories too, as places to drop cards and add new ones.
  const groups = useMemo(
    () => buildBoardGroups(categories.categories, services, { includeEmpty: editing }),
    [categories.categories, editing, services]
  );

  const categoryOptions = useMemo(
    () => categories.categories.map((category) => category.name),
    [categories.categories]
  );

  /**
   * Deletes right away and offers Undo, which restores it from the server's trash. Throws when the
   * delete fails so each caller can report it where the user is looking.
   */
  const handleDelete = useCallback(
    async (service: Service) => {
      await onDelete(service.id);

      toast({
        title: `Deleted ${service.name}`,
        action: {
          label: "Undo",
          onClick: () => {
            onRestore(service.id).then(
              () => toast({ title: `Restored ${service.name}`, tone: "success" }),
              (restoreError) => toastError(restoreError, "Couldn't restore the service")
            );
          },
        },
      });
    },
    [onDelete, onRestore]
  );

  const handleDeleteCard = useCallback(
    (service: Service) => {
      handleDelete(service).catch((deleteError) =>
        toastError(deleteError, "Couldn't delete the service")
      );
    },
    [handleDelete]
  );

  const handleDuplicate = useCallback(
    async (service: Service) => {
      try {
        const copy = await onDuplicate(service.id);
        toast({ title: `Added ${copy.name}`, tone: "success" });
      } catch (duplicateError) {
        toastError(duplicateError, "Couldn't duplicate the service");
      }
    },
    [onDuplicate]
  );

  const handleMove = useCallback(
    (move: ServiceMove) => {
      onMove(move).catch((moveError) => toastError(moveError, "Couldn't move the service"));
    },
    [onMove]
  );

  const handleAddToGroup = useCallback(
    (group: BoardGroup) => {
      setAddCategory(group.categoryId === null ? null : group.name);
      onAddOpenChange(true);
    },
    [onAddOpenChange]
  );

  const { remove: removeCategory, rename, reorder } = categories;

  const deleteCategory = useCallback(
    async (group: BoardGroup) => {
      if (group.categoryId === null) return;
      try {
        await removeCategory(group.categoryId);
        toast({ title: `Deleted ${group.name}` });
      } catch (deleteError) {
        toastError(deleteError, "Couldn't delete the category");
      }
    },
    [removeCategory]
  );

  // Empty categories go at once; ones with services ask first, since those services move out.
  const handleDeleteCategory = useCallback(
    (group: BoardGroup) => {
      if (group.services.length === 0) void deleteCategory(group);
      else setDeleteCategoryTarget(group);
    },
    [deleteCategory]
  );

  const handleRenameCategory = useCallback(
    (id: string, name: string) => {
      rename(id, name).catch((renameError) =>
        toastError(renameError, "Couldn't rename the category")
      );
    },
    [rename]
  );

  const handleReorderCategories = useCallback(
    (ids: string[]) => {
      reorder(ids).catch((reorderError) =>
        toastError(reorderError, "Couldn't save the category order")
      );
    },
    [reorder]
  );

  const initialLoading =
    (loading && services.length === 0) || (categories.loading && categories.error === null);

  return {
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
    showInitialError: !loading && error !== null && services.length === 0,
    showInitialLoading: initialLoading,
    showInlineError: error !== null && services.length > 0,
  };
}
