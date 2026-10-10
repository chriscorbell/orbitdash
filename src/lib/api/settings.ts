import { jsonBody, requestJson } from "@/lib/api/client";
import { categoryOrderResponseSchema } from "@/lib/api/schemas";
import type { CategoryOrderResponse, UpdateCategoryOrderPayload } from "@shared/types";

export function fetchCategoryOrder(): Promise<CategoryOrderResponse> {
  return requestJson(
    "/api/settings/category-order",
    {},
    "Failed to fetch category order",
    categoryOrderResponseSchema
  );
}

export function updateCategoryOrder(
  payload: UpdateCategoryOrderPayload
): Promise<CategoryOrderResponse> {
  return requestJson(
    "/api/settings/category-order",
    jsonBody("PUT", payload),
    "Failed to save category order",
    categoryOrderResponseSchema
  );
}
