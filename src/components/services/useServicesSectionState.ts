import { useCallback, useMemo, useState } from "react";
import { UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import type { RenameCategoryResponse, Service } from "@shared/types";
import type { ServiceGroup } from "@/components/services/CategorySectionList";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";
import { toast, toastError } from "@/lib/toast";

const UNCATEGORIZED_KEY = "uncategorized";

interface UseServicesSectionStateOptions {
  categoryOrder: UseCategoryOrderResult;
  error: string | null;
  loading: boolean;
  onDelete: (id: string) => Promise<void>;
  search: string;
  onRestore: (id: string) => Promise<Service>;
  onDuplicate: (id: string) => Promise<Service>;
  onRenameCategory: (from: string, to: string) => Promise<RenameCategoryResponse>;
  services: Service[];
}

export function useServicesSectionState({
  categoryOrder,
  error,
  loading,
  onDelete,
  search,
  onRestore,
  onDuplicate,
  onRenameCategory,
  services,
}: UseServicesSectionStateOptions) {
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [renameCategoryTarget, setRenameCategoryTarget] = useState<string | null>(null);

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
    const groups = new Map<string, ServiceGroup>();

    for (const service of filteredServices) {
      const name = service.category?.trim() || UNCATEGORIZED_CATEGORY;
      const group = groups.get(name) ?? {
        key: service.category_id ?? UNCATEGORIZED_KEY,
        name,
        services: [],
      };
      group.services.push(service);
      groups.set(name, group);
    }

    return visibleCategoryOrder
      .filter((category) => groups.has(category))
      .map((category) => groups.get(category)!);
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

  const handleRenameCategoryConfirm = async (to: string) => {
    if (!renameCategoryTarget) {
      return;
    }

    const response = await onRenameCategory(renameCategoryTarget, to);
    categoryOrder.applyOrder(response.order);
    toast({ title: `Renamed ${renameCategoryTarget} to ${to.trim()}`, tone: "success" });
    setRenameCategoryTarget(null);
  };

  return {
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
    showInitialError: !loading && error !== null && services.length === 0,
    showInitialLoading: loading && services.length === 0,
    showInlineError: error !== null && services.length > 0,
  };
}
