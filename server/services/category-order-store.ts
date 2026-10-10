import { sanitizeCategoryOrder } from "@shared/category-order";
import { listCategories, reorderCategories, resolveCategoryId } from "./category-store";

/** Category names in display order (the legacy order shape some clients still use). */
export function readCategoryOrder(): string[] {
  return listCategories().map((category) => category.name);
}

/**
 * Applies a legacy name-based order. Names without a category yet are created, matching the old
 * behavior where a saved order could mention categories before any service used them.
 */
export function writeCategoryOrder(order: readonly string[]): string[] {
  const ids = sanitizeCategoryOrder(order).map((name) => resolveCategoryId(name)!);
  reorderCategories(ids);
  return readCategoryOrder();
}
