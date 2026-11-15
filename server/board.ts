import type { DatabaseSync } from "node:sqlite";
import type { Board, Category, Layout, Link } from "../shared/types.ts";
import { transaction } from "./db.ts";

/** Bad input from the client: answered with 400 and the message. */
export class InputError extends Error {}
/** Answered with 404. */
export class NotFoundError extends Error {}
/** The client acted on a board that has changed since: answered with 409, and it reloads. */
export class ConflictError extends Error {}

export interface LinkFields {
  name: string;
  url: string;
  /** Category name; an unknown name creates the category, an empty one means none. */
  category: string;
  newTab: boolean;
}

interface LinkRow {
  id: string;
  category_id: string | null;
  name: string;
  url: string;
  icon: string | null;
  new_tab: number;
  position: number;
}

function toLink(row: LinkRow): Link {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    url: row.url,
    icon: row.icon,
    newTab: row.new_tab === 1,
  };
}

export function getBoard(db: DatabaseSync): Board {
  const categories = db
    .prepare("SELECT id, name FROM categories ORDER BY position")
    .all() as unknown as Category[];
  // Links without a category come first, then each category's links in category order.
  const links = db
    .prepare(
      `SELECT l.* FROM links l LEFT JOIN categories c ON c.id = l.category_id
       ORDER BY c.position IS NOT NULL, c.position, l.position`
    )
    .all() as unknown as LinkRow[];
  return { categories, links: links.map(toLink) };
}

function getLinkRow(db: DatabaseSync, id: string): LinkRow {
  const row = db.prepare("SELECT * FROM links WHERE id = ?").get(id) as LinkRow | undefined;
  if (!row) throw new NotFoundError("That link no longer exists.");
  return row;
}

function nextLinkPosition(db: DatabaseSync, categoryId: string | null): number {
  const row = db
    .prepare("SELECT coalesce(max(position) + 1, 0) AS next FROM links WHERE category_id IS ?")
    .get(categoryId) as { next: number };
  return row.next;
}

function findCategoryByName(db: DatabaseSync, name: string): Category | undefined {
  return db.prepare("SELECT id, name FROM categories WHERE name = ?").get(name) as
    Category | undefined;
}

function insertCategory(db: DatabaseSync, name: string): Category {
  const id = crypto.randomUUID();
  const { next } = db
    .prepare("SELECT coalesce(max(position) + 1, 0) AS next FROM categories")
    .get() as { next: number };
  db.prepare("INSERT INTO categories (id, name, position) VALUES (?, ?, ?)").run(id, name, next);
  return { id, name };
}

/** The category with this name (any case), created at the end if it doesn't exist yet. */
function resolveCategory(db: DatabaseSync, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return (findCategoryByName(db, trimmed) ?? insertCategory(db, trimmed)).id;
}

export function createLink(
  db: DatabaseSync,
  id: string,
  fields: LinkFields,
  icon: string | null
): Board {
  transaction(db, () => {
    const categoryId = resolveCategory(db, fields.category);
    db.prepare(
      "INSERT INTO links (id, category_id, position, name, url, icon, new_tab) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      categoryId,
      nextLinkPosition(db, categoryId),
      fields.name,
      fields.url,
      icon,
      fields.newTab ? 1 : 0
    );
  });
  return getBoard(db);
}

/**
 * Saves a link's fields. `icon` undefined keeps the current icon. Returns the icon it replaced, so
 * the caller can delete the file. A link moved to another category goes to the end of it.
 */
export function updateLink(
  db: DatabaseSync,
  id: string,
  fields: LinkFields,
  icon: string | null | undefined
): { board: Board; replacedIcon: string | null } {
  const replacedIcon = transaction(db, () => {
    const row = getLinkRow(db, id);
    const categoryId = resolveCategory(db, fields.category);
    const position =
      categoryId === row.category_id ? row.position : nextLinkPosition(db, categoryId);
    const nextIcon = icon === undefined ? row.icon : icon;
    db.prepare(
      "UPDATE links SET category_id = ?, position = ?, name = ?, url = ?, icon = ?, new_tab = ? WHERE id = ?"
    ).run(categoryId, position, fields.name, fields.url, nextIcon, fields.newTab ? 1 : 0, id);
    return nextIcon === row.icon ? null : row.icon;
  });
  return { board: getBoard(db), replacedIcon };
}

/** Deletes a link and returns its icon, so the caller can delete the file. */
export function deleteLink(db: DatabaseSync, id: string): { board: Board; icon: string | null } {
  const row = getLinkRow(db, id);
  db.prepare("DELETE FROM links WHERE id = ?").run(id);
  return { board: getBoard(db), icon: row.icon };
}

function assertNameFree(db: DatabaseSync, name: string, exceptId?: string): void {
  const existing = findCategoryByName(db, name);
  if (existing && existing.id !== exceptId) {
    throw new InputError(`There is already a category called ${existing.name}.`);
  }
}

export function createCategory(db: DatabaseSync, name: string): Board {
  transaction(db, () => {
    assertNameFree(db, name);
    insertCategory(db, name);
  });
  return getBoard(db);
}

export function renameCategory(db: DatabaseSync, id: string, name: string): Board {
  transaction(db, () => {
    assertNameFree(db, name, id);
    const { changes } = db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(name, id);
    if (changes === 0) throw new NotFoundError("That category no longer exists.");
  });
  return getBoard(db);
}

/** Deletes a category. Its links stay, moved to the end of the links without a category. */
export function deleteCategory(db: DatabaseSync, id: string): Board {
  transaction(db, () => {
    const ids = db
      .prepare("SELECT id FROM links WHERE category_id = ? ORDER BY position")
      .all(id) as Array<{ id: string }>;
    let position = nextLinkPosition(db, null);
    const move = db.prepare("UPDATE links SET category_id = NULL, position = ? WHERE id = ?");
    for (const link of ids) move.run(position++, link.id);
    const { changes } = db.prepare("DELETE FROM categories WHERE id = ?").run(id);
    if (changes === 0) throw new NotFoundError("That category no longer exists.");
  });
  return getBoard(db);
}

function sameMembers(given: string[], existing: string[]): boolean {
  const set = new Set(given);
  return (
    set.size === given.length && set.size === existing.length && existing.every((id) => set.has(id))
  );
}

/** Saves a whole arrangement. It must name every category and link exactly once. */
export function arrange(db: DatabaseSync, layout: Layout): Board {
  transaction(db, () => {
    const categoryIds = (
      db.prepare("SELECT id FROM categories").all() as Array<{ id: string }>
    ).map((row) => row.id);
    const linkIds = (db.prepare("SELECT id FROM links").all() as Array<{ id: string }>).map(
      (row) => row.id
    );
    const givenLinks = [
      layout.ungrouped,
      ...layout.categories.map((category) => category.links),
    ].flat();
    if (
      !sameMembers(
        layout.categories.map((category) => category.id),
        categoryIds
      ) ||
      !sameMembers(givenLinks, linkIds)
    ) {
      throw new ConflictError("The board changed in the meantime. Reload and try again.");
    }

    const placeCategory = db.prepare("UPDATE categories SET position = ? WHERE id = ?");
    const placeLink = db.prepare("UPDATE links SET category_id = ?, position = ? WHERE id = ?");
    layout.ungrouped.forEach((linkId, position) => placeLink.run(null, position, linkId));
    layout.categories.forEach((category, categoryPosition) => {
      placeCategory.run(categoryPosition, category.id);
      category.links.forEach((linkId, position) => placeLink.run(category.id, position, linkId));
    });
  });
  return getBoard(db);
}

/** Icon file names in use, for cleaning up files nothing points at. */
export function referencedIcons(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT icon FROM links WHERE icon IS NOT NULL").all() as Array<{
    icon: string;
  }>;
  return new Set(rows.map((row) => row.icon));
}
