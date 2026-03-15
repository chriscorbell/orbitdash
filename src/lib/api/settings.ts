import { requestJson } from "@/lib/api/client";
import type { CategoryOrderResponse, UpdateCategoryOrderPayload } from "@shared/types";

/** Fetch the saved category order */
export async function fetchCategoryOrder(): Promise<CategoryOrderResponse> {
    return requestJson<CategoryOrderResponse>(
        "/api/settings/category-order",
        {},
        "Failed to fetch category order"
    );
}

/** Persist category order */
export async function updateCategoryOrder(
    payload: UpdateCategoryOrderPayload
): Promise<CategoryOrderResponse> {
    return requestJson<CategoryOrderResponse>(
        "/api/settings/category-order",
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        },
        "Failed to save category order"
    );
}
