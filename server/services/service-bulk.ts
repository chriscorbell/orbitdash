import type { ServiceBulkChecksInput, ServiceBulkMoveInput } from "@shared/server-schemas";
import type { BulkDeleteServicesResponse, Service } from "@shared/types";
import { apiFail, apiOk, type ApiResult } from "../api-response";
import { getDb } from "../db";
import { getCategory } from "./category-store";
import {
  getServiceRecord,
  listServiceIdsInCategory,
  listServices,
  normalizeServiceRecord,
  writePositions,
  type ServiceRecord,
} from "./service-operations";
import { restoreService, trashService, TRASH_TTL_MS } from "./service-trash";

/**
 * Actions on several services at once, from edit mode's selection. Each runs in one transaction, so
 * a failure changes nothing, and answers with one response (and so one `layout` event). Ids that
 * don't exist are skipped; an action that matches none of them is a 404.
 */

interface ServicePlacement {
  category_id: string | null;
  id: string;
}

/** The listed services that exist, in board order: by category, then position. */
function readPlacements(ids: readonly string[]): ServicePlacement[] {
  return getDb()
    .prepare(
      `SELECT services.id, services.category_id
       FROM services LEFT JOIN categories ON categories.id = services.category_id
       WHERE services.id IN (SELECT value FROM json_each(?))
       ORDER BY categories.position IS NULL, categories.position ASC, services.position ASC,
                services.name ASC`
    )
    .all(JSON.stringify(ids)) as ServicePlacement[];
}

/**
 * Moves services to the end of one category (null = uncategorized), keeping their board order.
 * Ones already there stay where they are, and the categories they left are renumbered.
 */
export function bulkMoveServices(input: ServiceBulkMoveInput): ApiResult<Service[]> {
  const target = input.category_id;
  if (target !== null && !getCategory(target)) {
    return apiFail(404, "category not found");
  }

  const placements = readPlacements(input.ids);
  if (placements.length === 0) {
    return apiFail(404, "not found");
  }

  const moving = placements.filter((service) => service.category_id !== target);
  const movingIds = new Set(moving.map((service) => service.id));
  const sources = new Set(moving.map((service) => service.category_id));

  getDb().transaction(() => {
    for (const source of sources) {
      writePositions(
        source,
        listServiceIdsInCategory(source).filter((id) => !movingIds.has(id))
      );
    }
    writePositions(target, [...listServiceIdsInCategory(target), ...movingIds]);
  })();

  return apiOk(listServices());
}

/** Deletes services into the trash together, so one undo can bring them all back. */
export function bulkDeleteServices(
  ids: readonly string[],
  now: number = Date.now()
): ApiResult<BulkDeleteServicesResponse> {
  const deleted = getDb().transaction(
    () => ids.filter((id) => trashService(id, now).success).length
  )();

  if (deleted === 0) {
    return apiFail(404, "not found");
  }
  return apiOk({ success: true, deleted, restorableUntil: now + TRASH_TTL_MS });
}

/**
 * Restores trashed services. They go back lowest position first, so services deleted from one
 * category return in their old order.
 */
export function bulkRestoreServices(ids: readonly string[]): ApiResult<Service[]> {
  const db = getDb();
  const order = (
    db
      .prepare(
        `SELECT id FROM service_trash WHERE id IN (SELECT value FROM json_each(?))
         ORDER BY json_extract(data, '$.position') ASC, deleted_at ASC`
      )
      .all(JSON.stringify(ids)) as Array<{ id: string }>
  ).map((row) => row.id);

  const restored = db.transaction(
    () =>
      order.filter(
        (id) =>
          restoreService(id, (serviceId) => {
            const record = getServiceRecord(serviceId);
            return record ? normalizeServiceRecord(record) : null;
          }).success
      ).length
  )();

  if (restored === 0) {
    return apiFail(404, "nothing to restore");
  }
  return apiOk(listServices());
}

/**
 * Turns status checks on or off, or sets their interval. Method and target stay as they are, and
 * a check without a target checks the service's main URL.
 */
export function bulkUpdateServiceChecks(input: ServiceBulkChecksInput): ApiResult<Service[]> {
  const db = getDb();
  // bun:sqlite answers a missing row with null.
  const records = input.ids
    .map((id) => getServiceRecord(id))
    .filter((record): record is ServiceRecord => Boolean(record));
  if (records.length === 0) {
    return apiFail(404, "not found");
  }

  const update = db.prepare(
    "UPDATE services SET check_enabled = ?, check_interval = ?, updated_at = ? WHERE id = ?"
  );
  const now = Date.now();
  db.transaction(() => {
    for (const record of records) {
      const enabled = input.check_enabled ?? Boolean(record.check_enabled);
      update.run(enabled ? 1 : 0, input.check_interval ?? record.check_interval, now, record.id);
    }
  })();

  return apiOk(listServices());
}
