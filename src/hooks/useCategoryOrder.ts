import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCategoryOrder, updateCategoryOrder } from "@/lib/api/settings";
import { queryKeys } from "@/lib/query-client";
import { mergeCategoryOrder, UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import type { Service } from "@shared/types";

export type CategoryOrderSaveState = "idle" | "saving" | "saved" | "error";

export interface UseCategoryOrderResult {
  draftOrder: string[];
  error: string | null;
  hasNamedCategories: boolean;
  isDirty: boolean;
  isReorderMode: boolean;
  loading: boolean;
  namedCategories: string[];
  saveState: CategoryOrderSaveState;
  saving: boolean;
  visibleCategoryOrder: string[];
  applyOrder: (order: string[]) => void;
  beginReorder: () => void;
  cancelReorder: () => void;
  /** Moves a category one step and saves the new order right away. */
  moveCategory: (category: string, direction: "up" | "down") => Promise<void>;
  /** Moves a dragged category onto another's position and saves the new order right away. */
  reorderCategories: (activeId: string, overId: string) => Promise<void>;
  /** Saves the current draft order again, e.g. after a failed save. */
  saveOrder: () => Promise<void>;
}

// Same semantics as dnd-kit's arrayMove, kept local so this always-loaded hook
// does not pull dnd-kit into the initial bundle.
function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
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

const NO_ORDER: string[] = [];

export function useCategoryOrder(services: Service[]): UseCategoryOrderResult {
  const queryClient = useQueryClient();
  const orderQuery = useQuery({ queryKey: queryKeys.categoryOrder, queryFn: fetchCategoryOrder });
  const savedOrder = orderQuery.data?.order ?? NO_ORDER;
  const loading = orderQuery.isPending;
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [saveState, setSaveState] = useState<CategoryOrderSaveState>("idle");
  const [saveError, setError] = useState<string | null>(null);
  const error =
    saveError ??
    (orderQuery.error ? orderQuery.error.message || "Failed to load category order" : null);
  const setSavedOrder = useCallback(
    (order: string[]) => queryClient.setQueryData(queryKeys.categoryOrder, { order }),
    [queryClient]
  );
  // Saves run one after another so the server always ends on the latest order, and only the
  // latest save updates the status shown to the user.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestSaveRef = useRef(0);

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
  const isDirty = useMemo(() => {
    if (mergedDraftOrder.length !== mergedSavedOrder.length) return true;
    return mergedDraftOrder.some((cat, i) => cat !== mergedSavedOrder[i]);
  }, [mergedDraftOrder, mergedSavedOrder]);

  const visibleCategoryOrder = useMemo(() => {
    return hasUncategorized ? [...mergedSavedOrder, UNCATEGORIZED_CATEGORY] : mergedSavedOrder;
  }, [hasUncategorized, mergedSavedOrder]);

  const applyOrder = useCallback(
    (order: string[]) => {
      setSavedOrder(order);
      setDraftOrder(order);
    },
    [setSavedOrder]
  );

  const beginReorder = useCallback(() => {
    setDraftOrder(mergedSavedOrder);
    setError(null);
    setSaveState("idle");
    setIsReorderMode(true);
  }, [mergedSavedOrder]);

  const cancelReorder = useCallback(() => {
    setDraftOrder(mergedSavedOrder);
    setError(null);
    setSaveState("idle");
    setIsReorderMode(false);
  }, [mergedSavedOrder]);

  const persistOrder = useCallback(
    (nextOrder: string[]) => {
      latestSaveRef.current += 1;
      const saveId = latestSaveRef.current;
      setDraftOrder(nextOrder);
      setSaveState("saving");

      const save = async () => {
        try {
          const response = await updateCategoryOrder({ order: nextOrder });
          setSavedOrder(response.order);
          if (saveId === latestSaveRef.current) {
            setDraftOrder(response.order);
            setError(null);
            setSaveState("saved");
          }
        } catch (saveError) {
          if (saveId === latestSaveRef.current) {
            setError(
              saveError instanceof Error ? saveError.message : "Failed to save category order"
            );
            setSaveState("error");
          }
        }
      };

      const queued = saveQueueRef.current.then(save);
      saveQueueRef.current = queued;
      return queued;
    },
    [setSavedOrder]
  );

  const moveCategory = useCallback(
    (category: string, direction: "up" | "down") => {
      const currentIndex = mergedDraftOrder.indexOf(category);
      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex === -1 || nextIndex < 0 || nextIndex >= mergedDraftOrder.length) {
        return Promise.resolve();
      }

      return persistOrder(moveItem(mergedDraftOrder, currentIndex, nextIndex));
    },
    [mergedDraftOrder, persistOrder]
  );

  const reorderCategories = useCallback(
    (activeId: string, overId: string) => {
      const activeIndex = mergedDraftOrder.indexOf(activeId);
      const overIndex = mergedDraftOrder.indexOf(overId);
      if (activeId === overId || activeIndex === -1 || overIndex === -1) {
        return Promise.resolve();
      }

      return persistOrder(moveItem(mergedDraftOrder, activeIndex, overIndex));
    },
    [mergedDraftOrder, persistOrder]
  );

  const saveOrder = useCallback(
    () => persistOrder(mergedDraftOrder),
    [mergedDraftOrder, persistOrder]
  );

  return {
    draftOrder: mergedDraftOrder,
    error,
    hasNamedCategories,
    isDirty,
    isReorderMode,
    loading,
    namedCategories,
    saveState,
    saving: saveState === "saving",
    visibleCategoryOrder,
    applyOrder,
    beginReorder,
    cancelReorder,
    moveCategory,
    reorderCategories,
    saveOrder,
  };
}
