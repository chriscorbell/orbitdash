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
  {
    id: 6,
    name: "service-trash",
    // Deleted services wait here (as JSON) so a delete can be undone; a job purges old entries.
    statements: [
      `CREATE TABLE service_trash (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        deleted_at INTEGER NOT NULL
      )`,
      `CREATE INDEX service_trash_deleted_at_idx ON service_trash (deleted_at)`,
    ],
  },
  {
    id: 7,
    name: "metric-history",
    // Rolled-up host metrics (server/history/): one row per bucket, keyed by its start in ms.
    // weight_ms is how much sampled time the bucket covers; a NULL value means no reading.
    statements: ["metric_history_1m", "metric_history_15m"].map(
      (table) => `CREATE TABLE ${table} (
        ts INTEGER PRIMARY KEY,
        weight_ms INTEGER NOT NULL CHECK (weight_ms > 0),
        cpu_avg REAL, cpu_max REAL,
        mem_avg REAL, mem_max REAL,
        disk_avg REAL, disk_max REAL,
        load1_avg REAL, load1_max REAL,
        temp_avg REAL, temp_max REAL,
        net_rx_avg REAL, net_rx_max REAL,
        net_tx_avg REAL, net_tx_max REAL,
        disk_read_avg REAL, disk_read_max REAL,
        disk_write_avg REAL, disk_write_max REAL
      )`
    ),
  },
  {
    id: 8,
    name: "metric-alerts",
    // Threshold alerts (server/alerts/): one row per breach, resolved_at NULL while firing.
    statements: [
      `CREATE TABLE metric_alerts (
        id TEXT PRIMARY KEY,
        metric TEXT NOT NULL,
        subject TEXT,
        threshold REAL NOT NULL,
        duration_sec INTEGER NOT NULL,
        value REAL NOT NULL,
        peak REAL NOT NULL,
        started_at INTEGER NOT NULL,
        fired_at INTEGER NOT NULL,
        resolved_at INTEGER
      )`,
      "CREATE INDEX metric_alerts_fired_at ON metric_alerts (fired_at)",
    ],
  },
  {
    id: 9,
    name: "status-checks",
    // Status checks (server/status/). Off for every existing service, so an upgrade never starts
    // contacting anything on its own.
    statements: [
      `ALTER TABLE services ADD COLUMN check_enabled INTEGER NOT NULL DEFAULT 0
       CHECK (check_enabled IN (0, 1))`,
      `ALTER TABLE services ADD COLUMN check_method TEXT NOT NULL DEFAULT 'http'
       CHECK (check_method IN ('http', 'tcp'))`,
      `ALTER TABLE services ADD COLUMN check_target TEXT`,
      `ALTER TABLE services ADD COLUMN check_interval INTEGER NOT NULL DEFAULT 60
       CHECK (check_interval BETWEEN 15 AND 3600)`,
      `ALTER TABLE services ADD COLUMN check_ignore_tls INTEGER NOT NULL DEFAULT 0
       CHECK (check_ignore_tls IN (0, 1))`,
      // The current status per service. target_key names what was checked, so a status left from
      // an older target is never shown for a new one. failures counts failed checks in a row.
      `CREATE TABLE service_status (
        service_id TEXT PRIMARY KEY,
        target_key TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('up', 'degraded', 'down', 'unknown')),
        failures INTEGER NOT NULL DEFAULT 0,
        latency_ms INTEGER,
        status_code INTEGER,
        error TEXT,
        checked_at INTEGER,
        changed_at INTEGER
      )`,
      // Every check result, kept 24 hours. History has no foreign key on purpose: deleting a
      // service into the trash and restoring it, or importing a backup with the same ids, keeps
      // its history. The prune job removes history whose service is gone for good.
      `CREATE TABLE status_results (
        service_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
        latency_ms INTEGER,
        PRIMARY KEY (service_id, ts)
      ) WITHOUT ROWID`,
      `CREATE INDEX status_results_ts_idx ON status_results (ts)`,
      // Hourly totals, kept 30 days. Latency is summed over the checks that passed.
      `CREATE TABLE status_hourly (
        service_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        checks INTEGER NOT NULL,
        failures INTEGER NOT NULL,
        slow INTEGER NOT NULL,
        latency_sum_ms INTEGER NOT NULL,
        PRIMARY KEY (service_id, ts)
      ) WITHOUT ROWID`,
    ],
  },
  {
    id: 10,
    name: "auth-sessions",
    // Password sign-ins (server/auth/). Only a SHA-256 of each session token is stored, never the
    // token. auth_state holds the argon2 hash in force and a random credential id minted whenever
    // that hash changes; each session keeps the id it was created under, so a new password ends
    // older sessions while restarts keep them. Neither table is in backup exports, unlike `settings`.
    statements: [
      `CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user TEXT NOT NULL,
        credential TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        refreshed_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
      `CREATE INDEX sessions_expires_at_idx ON sessions (expires_at)`,
      `CREATE TABLE auth_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
  },
  {
    id: 11,
    name: "service-urls-links-tags",
    // A second URL for outside your network, extra named links, and tags. Links and tags are
    // small JSON arrays on the row rather than tables of their own, so the trash (which keeps the
    // whole row), duplicates and backups carry them without extra work.
    statements: [
      `ALTER TABLE services ADD COLUMN external_url TEXT`,
      `ALTER TABLE services ADD COLUMN links TEXT NOT NULL DEFAULT '[]'
       CHECK (json_valid(links) AND json_type(links) = 'array')`,
      `ALTER TABLE services ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'
       CHECK (json_valid(tags) AND json_type(tags) = 'array')`,
    ],
  },
  {
    id: 12,
    name: "notifications",
    // Notifications (server/notifications/). Channels and options live in `settings`, so backups
    // carry them; these two tables are runtime state and stay out of backups. A delivery row is one
    // message to one channel, trimmed to the newest few. An incident is a service that is down, with
    // when its "down" message went out (NULL until then), so a restart neither repeats nor loses it.
    statements: [
      `CREATE TABLE notification_deliveries (
        id INTEGER PRIMARY KEY,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        channel_type TEXT NOT NULL,
        event TEXT NOT NULL,
        title TEXT NOT NULL,
        ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
        attempts INTEGER NOT NULL,
        error TEXT,
        sent_at INTEGER NOT NULL
      )`,
      `CREATE TABLE notification_incidents (
        service_id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        notified_at INTEGER
      )`,
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
