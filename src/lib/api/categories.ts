import { jsonBody, requestJson } from "@/lib/api/client";
import { renameCategoryResponseSchema } from "@/lib/api/schemas";
import type { RenameCategoryPayload, RenameCategoryResponse } from "@shared/types";

/** Rename a category across all services that use it (renaming onto another merges them) */
export function renameCategory(payload: RenameCategoryPayload): Promise<RenameCategoryResponse> {
  return requestJson(
    "/api/categories/rename",
    jsonBody("POST", payload),
    "Failed to rename category",
    renameCategoryResponseSchema
  );
}
