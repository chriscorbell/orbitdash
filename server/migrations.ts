import type { Database } from "bun:sqlite";

interface Migration {
  id: number;
  name: string;
  statements: string[];
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

export function applyMigrations(db: Database): void {
  ensureMigrationsTable(db);
  bootstrapLegacyMigrationState(db);

  const applied = new Set(
    (
      db.prepare("SELECT id FROM schema_migrations ORDER BY id ASC").all() as Array<{ id: number }>
    ).map((row) => row.id)
  );
  const insertMigration = db.prepare(
    "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)"
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    const transaction = db.transaction(() => {
      for (const statement of migration.statements) {
        db.exec(statement);
      }

      insertMigration.run(migration.id, migration.name, Date.now());
    });

    transaction();
  }
}
