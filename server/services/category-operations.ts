import type { RenameCategoryResponse } from "@shared/types";
import { apiFail, apiOk, type ApiResult } from "../api-response";
import { getDb } from "../db";
import { readCategoryOrder, writeCategoryOrder } from "./category-order-store";
import { listServices } from "./service-operations";

export function renameCategory(from: string, to: string): ApiResult<RenameCategoryResponse> {
  const db = getDb();
  const existing = db
    .prepare("SELECT COUNT(*) AS count FROM services WHERE category = ?")
    .get(from) as { count: number };

  if (existing.count === 0) {
    return apiFail(404, "category not found");
  }

  // Renaming to an existing category merges the two; writeCategoryOrder
  // deduplicates the saved order in that case.
  const applyRename = db.transaction(() => {
    db.prepare("UPDATE services SET category = ?, updated_at = ? WHERE category = ?").run(
      to,
      Date.now(),
      from
    );

    const order = readCategoryOrder().map((category) => (category === from ? to : category));
    return writeCategoryOrder(order);
  });

  const order = applyRename();
  return apiOk({ services: listServices(), order });
}
