import { useCallback, useEffect, useMemo, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { fetchCategoryOrder, updateCategoryOrder } from "@/lib/api/settings";
import { mergeCategoryOrder, UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import type { Service } from "@shared/types";

export interface UseCategoryOrderResult {
  draftOrder: string[];
  error: string | null;
  hasNamedCategories: boolean;
  isReorderMode: boolean;
  loading: boolean;
  namedCategories: string[];
  saving: boolean;
  visibleCategoryOrder: string[];
  beginReorder: () => void;
  cancelReorder: () => void;
  moveCategory: (category: string, direction: "up" | "down") => void;
  reorderCategories: (activeId: string, overId: string) => void;
  saveOrder: () => Promise<void>;
}

function getNamedCategories(services: Service[]): string[] {
  const categories = new Set<string>();

  for (const service of services) {
    const category = service.category?.trim();
    if (!category) {
      continue;
    }
    categories.add(category);
  }

  return [...categories];
}

export function useCategoryOrder(services: Service[]): UseCategoryOrderResult {
  const [savedOrder, setSavedOrder] = useState<string[]>([]);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const namedCategories = useMemo(() => getNamedCategories(services), [services]);
  const hasNamedCategories = namedCategories.length > 0;
  const hasUncategorized = useMemo(
    () => services.some((service) => !service.category?.trim()),
    [services]
  );
  const mergedSavedOrder = useMemo(
    () => mergeCategoryOrder(namedCategories, savedOrder),
    [namedCategories, savedOrder]
  );
  const mergedDraftOrder = useMemo(
    () => mergeCategoryOrder(namedCategories, draftOrder),
    [namedCategories, draftOrder]
  );
  const visibleCategoryOrder = useMemo(() => {
    return hasUncategorized
      ? [...mergedSavedOrder, UNCATEGORIZED_CATEGORY]
      : mergedSavedOrder;
  }, [hasUncategorized, mergedSavedOrder]);

  useEffect(() => {
    let active = true;

    const loadCategoryOrder = async () => {
      try {
        const response = await fetchCategoryOrder();
        if (!active) {
          return;
        }
        setSavedOrder(response.order);
        setDraftOrder(response.order);
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }
        setSavedOrder([]);
        setDraftOrder([]);
        setError(loadError instanceof Error ? loadError.message : "Failed to load category order");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadCategoryOrder();

    return () => {
      active = false;
    };
  }, []);

  const beginReorder = useCallback(() => {
    setDraftOrder(mergedSavedOrder);
    setError(null);
    setIsReorderMode(true);
  }, [mergedSavedOrder]);

  const cancelReorder = useCallback(() => {
    setDraftOrder(mergedSavedOrder);
    setError(null);
    setIsReorderMode(false);
  }, [mergedSavedOrder]);

  const moveCategory = useCallback(
    (category: string, direction: "up" | "down") => {
      setDraftOrder((currentOrder) => {
        const orderedCategories = mergeCategoryOrder(namedCategories, currentOrder);
        const currentIndex = orderedCategories.indexOf(category);
        if (currentIndex === -1) {
          return orderedCategories;
        }

        const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex < 0 || nextIndex >= orderedCategories.length) {
          return orderedCategories;
        }

        return arrayMove(orderedCategories, currentIndex, nextIndex);
      });
    },
    [namedCategories]
  );

  const reorderCategories = useCallback(
    (activeId: string, overId: string) => {
      if (activeId === overId) {
        return;
      }

      setDraftOrder((currentOrder) => {
        const orderedCategories = mergeCategoryOrder(namedCategories, currentOrder);
        const activeIndex = orderedCategories.indexOf(activeId);
        const overIndex = orderedCategories.indexOf(overId);
        if (activeIndex === -1 || overIndex === -1) {
          return orderedCategories;
        }

        return arrayMove(orderedCategories, activeIndex, overIndex);
      });
    },
    [namedCategories]
  );

  const saveOrder = useCallback(async () => {
    const nextOrder = mergedDraftOrder;
    setSaving(true);
    try {
      const response = await updateCategoryOrder({ order: nextOrder });
      setSavedOrder(response.order);
      setDraftOrder(response.order);
      setError(null);
      setIsReorderMode(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save category order");
    } finally {
      setSaving(false);
    }
  }, [mergedDraftOrder]);

  return {
    draftOrder: mergedDraftOrder,
    error,
    hasNamedCategories,
    isReorderMode,
    loading,
    namedCategories,
    saving,
    visibleCategoryOrder,
    beginReorder,
    cancelReorder,
    moveCategory,
    reorderCategories,
    saveOrder,
  };
}
