import { jsonBody, requestJson } from "@/lib/api/client";
import { servicesResponseSchema } from "@/lib/api/schemas";
import type { BulkDeleteServicesResponse, BulkServiceChecksPayload, Service } from "@shared/types";
import * as z from "zod/mini";

/**
 * Edit mode's bulk actions. Kept out of `services.ts`, which the first paint loads, since only the
 * lazily loaded editor uses them. Each one is a single request, so a single change event.
 */

export const bulkDeleteResponseSchema = z.object({
  success: z.literal(true),
  deleted: z.number(),
  restorableUntil: z.number(),
});

/** Moves services to the end of a category (null = uncategorized); answers with every service. */
export function bulkMoveServices(ids: string[], categoryId: string | null): Promise<Service[]> {
  return requestJson(
    "/api/services/bulk/move",
    jsonBody("POST", { ids, category_id: categoryId }),
    "Failed to move services",
    servicesResponseSchema
  );
}

export function bulkDeleteServices(ids: string[]): Promise<BulkDeleteServicesResponse> {
  return requestJson(
    "/api/services/bulk/delete",
    jsonBody("POST", { ids }),
    "Failed to delete services",
    bulkDeleteResponseSchema
  );
}

export function bulkRestoreServices(ids: string[]): Promise<Service[]> {
  return requestJson(
    "/api/services/bulk/restore",
    jsonBody("POST", { ids }),
    "Failed to restore services",
    servicesResponseSchema
  );
}

export function bulkUpdateServiceChecks(payload: BulkServiceChecksPayload): Promise<Service[]> {
  return requestJson(
    "/api/services/bulk/checks",
    jsonBody("POST", payload),
    "Failed to change status checks",
    servicesResponseSchema
  );
}
