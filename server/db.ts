import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 1;

const SCHEMA = `
  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
    position INTEGER NOT NULL
  );
  CREATE TABLE links (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    position INTEGER NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    url TEXT NOT NULL,
    icon TEXT,
    new_tab INTEGER NOT NULL DEFAULT 1 CHECK (new_tab IN (0, 1))
  );
  CREATE INDEX links_category_position ON links (category_id, position);
`;

/** Name of the copy of a 1.x database kept next to the upgraded one. */
export const V1_BACKUP_NAME = "orbitdash-v1.db";

type Log = (message: string) => void;

export function transaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = run();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function hasTable(db: DatabaseSync, name: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
    undefined
  );
}

function columnsOf(db: DatabaseSync, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

interface V1Link {
  id: string;
  category: string | null;
  name: string;
  url: string;
  icon: string | null;
  newTab: number;
}

/**
 * Reads the links and categories out of an orbitdash 1.x database, whichever 1.x schema it has:
 * categories moved from a text column on services to their own table along the way.
 */
function readV1(db: DatabaseSync): {
  categories: Array<{ id: string; name: string }>;
  links: V1Link[];
} {
  const columns = columnsOf(db, "services");
  const order = columns.has("position") ? "s.position, s.name" : "s.name COLLATE NOCASE";

  if (columns.has("category_id") && hasTable(db, "categories")) {
    const categories = db
      .prepare("SELECT id, name FROM categories ORDER BY position, name")
      .all() as Array<{ id: string; name: string }>;
    const links = db
      .prepare(
        `SELECT s.id, s.category_id AS category, s.name, s.url, s.icon, s.open_in_new_tab AS newTab
         FROM services s LEFT JOIN categories c ON c.id = s.category_id
         ORDER BY c.position, ${order}`
      )
      .all() as unknown as V1Link[];
    return { categories, links };
  }

  const rows = db
    .prepare(
      `SELECT s.id, nullif(trim(s.category), '') AS category, s.name, s.url, s.icon,
              s.open_in_new_tab AS newTab
       FROM services s ORDER BY ${order}`
    )
    .all() as unknown as V1Link[];
  const names = [...new Set(rows.flatMap((row) => (row.category ? [row.category] : [])))].sort();
  const ids = new Map(names.map((name) => [name, crypto.randomUUID()]));
  return {
    categories: names.map((name) => ({ id: ids.get(name)!, name })),
    links: rows.map((row) => ({ ...row, category: row.category ? ids.get(row.category)! : null })),
  };
}

/**
 * Turns an orbitdash 1.x database into this schema in place, keeping each link's name, URL, icon,
 * category and order. Everything else 1.x stored (metrics, status history, settings, sessions) is
 * dropped. A full copy of the 1.x database is written next to it first.
 */
function upgradeFromV1(db: DatabaseSync, file: string, log: Log): void {
  const backup = path.join(path.dirname(file), V1_BACKUP_NAME);
  if (!fs.existsSync(backup)) {
    db.prepare("VACUUM INTO ?").run(backup);
  }

  const { categories, links } = readV1(db);
  const objects = db
    .prepare(
      `SELECT type, name FROM sqlite_master
       WHERE type IN ('view', 'table') AND name NOT LIKE 'sqlite_%'
       ORDER BY type = 'table'`
    )
    .all() as Array<{ type: string; name: string }>;

  transaction(db, () => {
    for (const object of objects) {
      db.exec(`DROP ${object.type === "view" ? "VIEW" : "TABLE"} IF EXISTS "${object.name}"`);
    }
    db.exec(SCHEMA);

    const insertCategory = db.prepare(
      "INSERT INTO categories (id, name, position) VALUES (?, ?, ?)"
    );
    categories.forEach((category, position) => {
      insertCategory.run(category.id, category.name.trim(), position);
    });

    const known = new Set(categories.map((category) => category.id));
    const nextPosition = new Map<string | null, number>();
    const insertLink = db.prepare(
      "INSERT INTO links (id, category_id, position, name, url, icon, new_tab) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const link of links) {
      const categoryId = link.category && known.has(link.category) ? link.category : null;
      const position = nextPosition.get(categoryId) ?? 0;
      nextPosition.set(categoryId, position + 1);
      insertLink.run(
        link.id,
        categoryId,
        position,
        link.name.trim(),
        link.url,
        link.icon,
        link.newTab ? 1 : 0
      );
    }

    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });

  db.exec("VACUUM");
  log(
    `Upgraded the orbitdash 1.x database: kept ${links.length} links in ${categories.length} categories. The 1.x database is saved as ${V1_BACKUP_NAME}.`
  );
}

export function openDatabase(file: string, log: Log = console.log): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Foreign keys stay off until the schema is in place: the 1.x upgrade drops tables that
  // reference each other.
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: false });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");

  const { user_version: version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  if (version < SCHEMA_VERSION) {
    if (hasTable(db, "schema_migrations")) {
      upgradeFromV1(db, file, log);
    } else {
      transaction(db, () => {
        db.exec(SCHEMA);
        db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      });
    }
  }

  db.exec("PRAGMA foreign_keys = ON");
  return db;
}
