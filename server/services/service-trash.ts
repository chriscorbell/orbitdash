import type { Service } from "@shared/types";
import { apiFail, apiOk, type ApiResult } from "../api-response";
import { getDb } from "../db";
import { getCategory } from "./category-store";
import { listReferencedIcons, removeStoredIcon } from "./icon-storage";

/** How long a deleted service can be restored before the purge job removes it for good. */
export const TRASH_TTL_MS = 30 * 60 * 1000;

type ServiceRow = Record<string, unknown> & {
  category_id: string | null;
  icon: string | null;
  id: string;
  position: number;
};

/** Moves a service into the trash instead of deleting it; its icon stays until the purge. */
export function trashService(
  id: string,
  now: number = Date.now()
): ApiResult<{ restorableUntil: number }> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as ServiceRow | null;
  if (!row) {
    return apiFail(404, "not found");
  }

  db.transaction(() => {
    db.prepare(
      `INSERT INTO service_trash (id, data, deleted_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, deleted_at = excluded.deleted_at`
    ).run(id, JSON.stringify(row), now);
    db.prepare("DELETE FROM services WHERE id = ?").run(id);
  })();

  return apiOk({ restorableUntil: now + TRASH_TTL_MS });
}

/**
 * Puts a trashed service back where it was. If its category was deleted in the meantime it comes
 * back uncategorized; services that moved into its old slot shift down by one.
 */
export function restoreService(
  id: string,
  readService: (id: string) => Service | null
): ApiResult<Service> {
  const db = getDb();
  const trashed = db.prepare("SELECT data FROM service_trash WHERE id = ?").get(id) as {
    data: string;
  } | null;
  if (!trashed) {
    return apiFail(404, "nothing to restore");
  }
  if (db.prepare("SELECT 1 FROM services WHERE id = ?").get(id)) {
    db.prepare("DELETE FROM service_trash WHERE id = ?").run(id);
    return apiFail(409, "service already exists");
  }

  const row = JSON.parse(trashed.data) as ServiceRow;
  const categoryId = row.category_id && getCategory(row.category_id) ? row.category_id : null;
  const restored: ServiceRow = { ...row, category_id: categoryId, updated_at: Date.now() };
  const columns = Object.keys(restored);

  db.transaction(() => {
    const slotTaken = db
      .prepare("SELECT 1 FROM services WHERE category_id IS ? AND position = ?")
      .get(categoryId, restored.position);
    if (slotTaken) {
      db.prepare(
        "UPDATE services SET position = position + 1 WHERE category_id IS ? AND position >= ?"
      ).run(categoryId, restored.position);
    }
    db.prepare(
      `INSERT INTO services (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`
    ).run(...columns.map((column) => restored[column] as string | number | null));
    db.prepare("DELETE FROM service_trash WHERE id = ?").run(id);
  })();

  return apiOk(readService(id)!);
}

/** Permanently removes trash older than the TTL, and any icon nothing else references. */
export function purgeTrash(now: number = Date.now()): number {
  const db = getDb();
  const expired = db
    .prepare(
      `SELECT id, json_extract(data, '$.icon') AS icon FROM service_trash WHERE deleted_at <= ?`
    )
    .all(now - TRASH_TTL_MS) as Array<{ icon: string | null; id: string }>;
  if (expired.length === 0) {
    return 0;
  }

  db.transaction(() => {
    const remove = db.prepare("DELETE FROM service_trash WHERE id = ?");
    for (const entry of expired) remove.run(entry.id);
  })();

  const stillUsed = listReferencedIcons();
  for (const entry of expired) {
    if (entry.icon && !stillUsed.has(entry.icon)) {
      removeStoredIcon(entry.icon);
    }
  }

  return expired.length;
}
