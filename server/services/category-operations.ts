import type { RenameCategoryResponse } from "@shared/types";
import { apiFail, apiOk, type ApiResult } from "../api-response";
import { findCategoryByName, mergeCategories, renameCategoryById } from "./category-store";
import { readCategoryOrder } from "./category-order-store";
import { listServices } from "./service-operations";

/** Renames a category by name; renaming onto an existing category merges the two. */
export function renameCategory(from: string, to: string): ApiResult<RenameCategoryResponse> {
  const source = findCategoryByName(from);
  if (!source) {
    return apiFail(404, "category not found");
  }

  const target = findCategoryByName(to);
  if (target && target.id !== source.id) {
    mergeCategories(source.id, target.id);
  } else {
    const renamed = renameCategoryById(source.id, to);
    if (!renamed.success) {
      return renamed;
    }
  }

  return apiOk({ services: listServices(), order: readCategoryOrder() });
}
