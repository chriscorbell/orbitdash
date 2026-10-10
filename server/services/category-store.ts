import type { Category } from "@shared/types";
import { UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import { apiFail, apiOk, type ApiResult } from "../api-response";
import { getDb } from "../db";

export function listCategories(): Category[] {
  return getDb()
    .prepare("SELECT * FROM categories ORDER BY position ASC, name ASC")
    .all() as Category[];
}

export function getCategory(id: string): Category | null {
  return (getDb().prepare("SELECT * FROM categories WHERE id = ?").get(id) as Category) ?? null;
}

export function findCategoryByName(name: string): Category | null {
  return (
    (getDb().prepare("SELECT * FROM categories WHERE name = ?").get(name.trim()) as Category) ??
    null
  );
}

function nextCategoryPosition(): number {
  const row = getDb().prepare("SELECT MAX(position) AS max FROM categories").get() as {
    max: number | null;
  };
  return (row.max ?? -1) + 1;
}

function insertCategory(name: string): Category {
  const now = Date.now();
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      "INSERT INTO categories (id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, name, nextCategoryPosition(), now, now);
  return getCategory(id)!;
}

/**
 * The category id for a free-text name, creating the category at the end when it's new. Empty
 * names and the reserved "Uncategorized" label both mean no category.
 */
export function resolveCategoryId(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed || trimmed === UNCATEGORIZED_CATEGORY) {
    return null;
  }
  return (findCategoryByName(trimmed) ?? insertCategory(trimmed)).id;
}

export function createCategory(name: string): ApiResult<Category> {
  if (findCategoryByName(name)) {
    return apiFail(409, "a category with that name already exists");
  }
  return apiOk(insertCategory(name.trim()));
}

export function renameCategoryById(id: string, name: string): ApiResult<Category> {
  const category = getCategory(id);
  if (!category) {
    return apiFail(404, "category not found");
  }

  const existing = findCategoryByName(name);
  if (existing && existing.id !== id) {
    return apiFail(409, "a category with that name already exists");
  }

  getDb()
    .prepare("UPDATE categories SET name = ?, updated_at = ? WHERE id = ?")
    .run(name.trim(), Date.now(), id);
  return apiOk(getCategory(id)!);
}

function nextServicePosition(categoryId: string | null): number {
  const row = getDb()
    .prepare("SELECT MAX(position) AS max FROM services WHERE category_id IS ?")
    .get(categoryId) as { max: number | null };
  return (row.max ?? -1) + 1;
}

/** Appends every service of `fromId` (null = uncategorized) to the end of `toId`, keeping order. */
export function moveAllServices(fromId: string | null, toId: string | null): void {
  const db = getDb();
  const services = db
    .prepare("SELECT id FROM services WHERE category_id IS ? ORDER BY position ASC, name ASC")
    .all(fromId) as Array<{ id: string }>;
  let position = nextServicePosition(toId);
  const move = db.prepare(
    "UPDATE services SET category_id = ?, position = ?, updated_at = ? WHERE id = ?"
  );
  const now = Date.now();
  for (const service of services) {
    move.run(toId, position++, now, service.id);
  }
}

/** Deletes a category; its services become uncategorized. */
export function deleteCategory(id: string): ApiResult<{ success: true }> {
  if (!getCategory(id)) {
    return apiFail(404, "category not found");
  }

  const db = getDb();
  db.transaction(() => {
    moveAllServices(id, null);
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  })();
  return apiOk({ success: true });
}

/** Merges `sourceId` into `targetId`: services move over and the source category is removed. */
export function mergeCategories(sourceId: string, targetId: string): void {
  const db = getDb();
  db.transaction(() => {
    moveAllServices(sourceId, targetId);
    db.prepare("DELETE FROM categories WHERE id = ?").run(sourceId);
  })();
}

/** Puts the listed categories first in the given order; any others keep their relative order. */
export function reorderCategories(ids: readonly string[]): Category[] {
  const db = getDb();
  const current = listCategories();
  const known = new Set(current.map((category) => category.id));
  const listed = [...new Set(ids)].filter((id) => known.has(id));
  const rest = current.map((category) => category.id).filter((id) => !listed.includes(id));

  const setPosition = db.prepare("UPDATE categories SET position = ? WHERE id = ?");
  db.transaction(() => {
    [...listed, ...rest].forEach((id, position) => setPosition.run(position, id));
  })();
  return listCategories();
}

export { nextServicePosition };
