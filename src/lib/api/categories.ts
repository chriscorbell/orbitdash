import { invalidateRequestCache, requestJson } from "@/lib/api/client";
import { renameCategoryResponseSchema } from "@shared/schemas";
import type { RenameCategoryPayload, RenameCategoryResponse } from "@shared/types";

/** Rename a category across all services that use it */
export async function renameCategory(
  payload: RenameCategoryPayload
): Promise<RenameCategoryResponse> {
  const response = await requestJson<RenameCategoryResponse>(
    "/api/categories/rename",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Failed to rename category",
    renameCategoryResponseSchema
  );

  invalidateRequestCache("/api/services");
  invalidateRequestCache("/api/settings/category-order");
  return response;
}
