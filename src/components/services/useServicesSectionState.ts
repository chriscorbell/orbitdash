import { useMemo, useState } from "react";
import { UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import type { RenameCategoryResponse, Service } from "@shared/types";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";

interface UseServicesSectionStateOptions {
  categoryOrder: UseCategoryOrderResult;
  columnCount: 3 | 4 | 5;
  error: string | null;
  loading: boolean;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<Service>;
  onRenameCategory: (from: string, to: string) => Promise<RenameCategoryResponse>;
  services: Service[];
}

export function useServicesSectionState({
  categoryOrder,
  columnCount,
  error,
  loading,
  onDelete,
  onDuplicate,
  onRenameCategory,
  services,
}: UseServicesSectionStateOptions) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renameCategoryTarget, setRenameCategoryTarget] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const {
    error: categoryOrderError,
    hasNamedCategories,
    isReorderMode,
    visibleCategoryOrder,
  } = categoryOrder;

  const filteredServices = useMemo(() => {
    if (!search.trim()) {
      return services;
    }

    const query = search.toLowerCase();
    return services.filter(
      (service) =>
        service.name.toLowerCase().includes(query) ||
        service.description?.toLowerCase().includes(query) ||
        service.category?.toLowerCase().includes(query) ||
        service.url.toLowerCase().includes(query)
    );
  }, [search, services]);

  const groupedServices = useMemo(() => {
    const groups = new Map<string, Service[]>();

    for (const service of filteredServices) {
      const category = service.category?.trim() || UNCATEGORIZED_CATEGORY;
      const servicesInCategory = groups.get(category) || [];
      servicesInCategory.push(service);
      groups.set(category, servicesInCategory);
    }

    return visibleCategoryOrder
      .filter((category) => groups.has(category))
      .map((category) => [category, groups.get(category) ?? []] as const);
  }, [filteredServices, visibleCategoryOrder]);

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];

    for (const service of services) {
      const category = service.category?.trim();
      if (!category || seen.has(category)) {
        continue;
      }

      seen.add(category);
      options.push(category);
    }

    return options.sort((left, right) => left.localeCompare(right));
  }, [services]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    setActionError(null);

    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error ? deleteError.message : "Failed to delete service"
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async (service: Service) => {
    setActionError(null);
    try {
      await onDuplicate(service.id);
    } catch (duplicateError) {
      setActionError(
        duplicateError instanceof Error ? duplicateError.message : "Failed to duplicate service"
      );
    }
  };

  const handleRenameCategoryConfirm = async (to: string) => {
    if (!renameCategoryTarget) {
      return;
    }

    const response = await onRenameCategory(renameCategoryTarget, to);
    categoryOrder.applyOrder(response.order);
    setRenameCategoryTarget(null);
  };

  return {
    actionError,
    addOpen,
    categoryOptions,
    categoryOrderError,
    deleteTarget,
    deleting,
    editingService,
    filteredServices,
    gridClassName:
      columnCount === 5
        ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        : columnCount === 3
          ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
    groupedServices,
    handleDeleteConfirm,
    handleDuplicate,
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
    showInitialError: !loading && error !== null && services.length === 0,
    showInitialLoading: loading && services.length === 0,
    showInlineError: error !== null && services.length > 0,
  };
}
