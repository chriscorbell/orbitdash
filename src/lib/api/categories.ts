import { jsonBody, requestJson } from "@/lib/api/client";
import { categoriesResponseSchema, categorySchema, successResponseSchema } from "@/lib/api/schemas";
import type { Category } from "@shared/types";

/** Categories in display order, including empty ones. */
export async function fetchCategories(): Promise<Category[]> {
  const response = await requestJson(
    "/api/categories",
    {},
    "Failed to load categories",
    categoriesResponseSchema
  );
  return response.categories;
}

/** Creates an empty category at the end. */
export function createCategory(name: string): Promise<Category> {
  return requestJson(
    "/api/categories",
    jsonBody("POST", { name }),
    "Failed to create category",
    categorySchema
  );
}

export function renameCategory(id: string, name: string): Promise<Category> {
  return requestJson(
    `/api/categories/${id}`,
    jsonBody("PATCH", { name }),
    "Failed to rename category",
    categorySchema
  );
}

/** Deletes a category; its services become uncategorized. */
export async function deleteCategory(id: string): Promise<void> {
  await requestJson(
    `/api/categories/${id}`,
    { method: "DELETE" },
    "Failed to delete category",
    successResponseSchema
  );
}

export async function reorderCategories(ids: string[]): Promise<Category[]> {
  const response = await requestJson(
    "/api/categories/order",
    jsonBody("PUT", { ids }),
    "Failed to save category order",
    categoriesResponseSchema
  );
  return response.categories;
}
