import { invalidateRequestCache, requestJson, requestJsonCached } from "@/lib/api/client";
import { categoryOrderResponseSchema } from "@shared/schemas";
import type { CategoryOrderResponse, UpdateCategoryOrderPayload } from "@shared/types";

/** Fetch the saved category order */
export async function fetchCategoryOrder(): Promise<CategoryOrderResponse> {
  return requestJsonCached<CategoryOrderResponse>(
    "/api/settings/category-order",
    {},
    "Failed to fetch category order",
    categoryOrderResponseSchema
  );
}

/** Persist category order */
export async function updateCategoryOrder(
  payload: UpdateCategoryOrderPayload
): Promise<CategoryOrderResponse> {
  const response = await requestJson<CategoryOrderResponse>(
    "/api/settings/category-order",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Failed to save category order",
    categoryOrderResponseSchema
  );

  invalidateRequestCache("/api/settings/category-order");
  return response;
}
