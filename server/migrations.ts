import type { Database } from "bun:sqlite";
import { CATEGORY_ORDER_SETTING_KEY, mergeCategoryOrder } from "@shared/category-order";

interface Migration {
  id: number;
  name: string;
  statements?: string[];
  /** For data migrations that SQL alone can't express; runs after `statements`. */
  up?: (db: Database) => void;
}

function readLegacyCategoryOrder(db: Database): string[] {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(CATEGORY_ORDER_SETTING_KEY) as { value: string } | null;
  if (!row) return [];

  try {
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Moves categories out of free-text service columns into their own table, keeping the saved
 * category order, and gives every service a position that matches today's alphabetical order.
 */
function migrateToCategoriesTable(db: Database): void {
  const now = Date.now();
  const names = (
    db
      .prepare(
        `SELECT DISTINCT trim(category) AS name FROM services
         WHERE category IS NOT NULL AND trim(category) != ''`
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);

  const insertCategory = db.prepare(
    "INSERT INTO categories (id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  mergeCategoryOrder(names, readLegacyCategoryOrder(db)).forEach((name, position) => {
    insertCategory.run(crypto.randomUUID(), name, position, now, now);
  });

  db.exec(`UPDATE services
           SET category_id = (SELECT id FROM categories WHERE categories.name = trim(services.category))`);

  const services = db
    .prepare("SELECT id, category_id FROM services ORDER BY name COLLATE NOCASE ASC, name ASC")
    .all() as Array<{ id: string; category_id: string | null }>;
  const nextPosition = new Map<string | null, number>();
  const setPosition = db.prepare("UPDATE services SET position = ? WHERE id = ?");
  for (const service of services) {
    const position = nextPosition.get(service.category_id) ?? 0;
    setPosition.run(position, service.id);
    nextPosition.set(service.category_id, position + 1);
  }

  db.exec("DROP INDEX IF EXISTS services_category_name_idx");
  db.exec("ALTER TABLE services DROP COLUMN category");
  db.exec("CREATE INDEX services_category_position_idx ON services (category_id, position)");
  db.prepare("DELETE FROM settings WHERE key = ?").run(CATEGORY_ORDER_SETTING_KEY);
}

const migrations: Migration[] = [
  {
    id: 1,
    name: "initial-schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS metrics_samples (
        ts INTEGER PRIMARY KEY,
        cpu REAL NOT NULL,
        ram REAL NOT NULL,
        disk REAL NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        category TEXT,
        open_in_new_tab INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS services_category_name_idx
       ON services (category, name)`,
    ],
  },
  {
    id: 2,
    name: "services-constraints",
    statements: [
      `ALTER TABLE services RENAME TO services_legacy`,
      `CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        url TEXT NOT NULL CHECK (length(trim(url)) > 0),
        description TEXT,
        icon TEXT,
        category TEXT,
        open_in_new_tab INTEGER NOT NULL DEFAULT 1 CHECK (open_in_new_tab IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `INSERT INTO services (id, name, url, description, icon, category, open_in_new_tab, created_at, updated_at)
       SELECT id, trim(name), trim(url), description, icon, category, open_in_new_tab, created_at, updated_at
       FROM services_legacy`,
      `DROP TABLE services_legacy`,
      `CREATE INDEX IF NOT EXISTS services_category_name_idx
       ON services (category, name)`,
    ],
  },
  {
    id: 3,
    name: "drop-metrics-samples",
    // Metric samples moved to an in-memory buffer; see server/metrics.ts.
    statements: [`DROP TABLE IF EXISTS metrics_samples`],
  },
  {
    // Installs that already ran migration 5 pick this up afterwards; it only adds a column.
    id: 4,
    name: "services-icon-source-url",
    // Remembers where a downloaded icon came from so it can be refreshed later.
    statements: [`ALTER TABLE services ADD COLUMN icon_source_url TEXT`],
  },
  {
    id: 5,
    name: "categories-table",
    statements: [
      `CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
        position INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `ALTER TABLE services ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL`,
      `ALTER TABLE services ADD COLUMN position INTEGER NOT NULL DEFAULT 0`,
    ],
    up: migrateToCategoriesTable,
  },
];

function ensureMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);
}

function hasLegacyCoreSchema(db: Database): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM sqlite_master
       WHERE type = 'table' AND name IN ('metrics_samples', 'services', 'settings')`
    )
    .get() as { count: number };

  return row.count === 3;
}

function bootstrapLegacyMigrationState(db: Database): void {
  const appliedCount = db.prepare("SELECT COUNT(*) as count FROM schema_migrations").get() as {
    count: number;
  };

  if (appliedCount.count > 0 || !hasLegacyCoreSchema(db)) {
    return;
  }

  db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
    migrations[0].id,
    migrations[0].name,
    Date.now()
  );
}

function readAppliedMigrationIds(db: Database): Set<number> {
  return new Set(
    (
      db.prepare("SELECT id FROM schema_migrations ORDER BY id ASC").all() as Array<{ id: number }>
    ).map((row) => row.id)
  );
}

function hasAnyTables(db: Database): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'`
    )
    .get() as { count: number };

  return row.count > 0;
}

/**
 * True when the database already holds data and at least one migration still has to run, which is
 * the moment a pre-migration snapshot is worth taking. A brand-new database returns false.
 */
export function needsPreMigrationSnapshot(db: Database): boolean {
  if (!hasAnyTables(db)) {
    return false;
  }

  ensureMigrationsTable(db);
  bootstrapLegacyMigrationState(db);
  const applied = readAppliedMigrationIds(db);
  return migrations.some((migration) => !applied.has(migration.id));
}

export function applyMigrations(db: Database): void {
  ensureMigrationsTable(db);
  bootstrapLegacyMigrationState(db);

  const applied = readAppliedMigrationIds(db);
  const insertMigration = db.prepare(
    "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)"
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    const transaction = db.transaction(() => {
      for (const statement of migration.statements ?? []) {
        db.exec(statement);
      }
      migration.up?.(db);

      insertMigration.run(migration.id, migration.name, Date.now());
    });

    transaction();
  }
}
