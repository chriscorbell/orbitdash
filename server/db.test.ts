import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import {
  closeDb,
  getDb,
  getDbPath,
  initializeDb,
  isDbHealthy,
  isDbInitialized,
  resetDbForTesting,
} from "./db";
import { createTestDataDir } from "./test-utils";

let testDataDir: string | null = null;

/** The schema orbitdash 0.2 shipped: migrations 1 to 3 applied, categories as free text. */
function applyLegacyV02Schema(db: Database) {
  db.exec(`
    CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL);
    INSERT INTO schema_migrations VALUES (1, 'initial-schema', 1), (2, 'services-constraints', 1), (3, 'drop-metrics-samples', 1);
    CREATE TABLE services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      url TEXT NOT NULL CHECK (length(trim(url)) > 0),
      description TEXT,
      icon TEXT,
      category TEXT,
      open_in_new_tab INTEGER NOT NULL DEFAULT 1 CHECK (open_in_new_tab IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX services_category_name_idx ON services (category, name);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
}

beforeEach(() => {
  closeDb();
  testDataDir = createTestDataDir("orbitdash-db-");
});

afterEach(() => {
  closeDb();
  if (testDataDir) {
    resetDbForTesting({ dataDir: testDataDir });
  }
});

describe("database integration", () => {
  it("initializes the schema and reports health for an isolated database", () => {
    initializeDb({ dataDir: testDataDir! });

    expect(isDbInitialized()).toBe(true);
    expect(isDbHealthy()).toBe(true);
    expect(fs.existsSync(getDbPath())).toBe(true);

    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC")
      .all() as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toEqual([
      "auth_state",
      "categories",
      "metric_alerts",
      "metric_history_15m",
      "metric_history_1m",
      "schema_migrations",
      "service_status",
      "service_trash",
      "services",
      "sessions",
      "settings",
      "status_hourly",
      "status_results",
    ]);

    expect(db.prepare("SELECT id, name FROM schema_migrations ORDER BY id ASC").all()).toEqual([
      {
        id: 1,
        name: "initial-schema",
      },
      {
        id: 2,
        name: "services-constraints",
      },
      {
        id: 3,
        name: "drop-metrics-samples",
      },
      {
        id: 4,
        name: "services-icon-source-url",
      },
      {
        id: 5,
        name: "categories-table",
      },
      {
        id: 6,
        name: "service-trash",
      },
      {
        id: 7,
        name: "metric-history",
      },
      { id: 8, name: "metric-alerts" },
      { id: 9, name: "status-checks" },
      { id: 10, name: "auth-sessions" },
      { id: 11, name: "service-urls-links-tags" },
    ]);
  });

  it("adds a nullable icon_source_url column to services in a 0.2 database", () => {
    const legacy = new Database(path.join(testDataDir!, "orbitdash.db"));
    applyLegacyV02Schema(legacy);
    legacy.exec(
      `INSERT INTO services VALUES ('svc-1', 'Orbit', 'https://example.com', NULL, 'svc-1.png', NULL, 1, 1, 1)`
    );
    legacy.close();

    initializeDb({ dataDir: testDataDir! });

    expect(
      getDb().prepare("SELECT icon, icon_source_url FROM services WHERE id = ?").get("svc-1")
    ).toEqual({ icon: "svc-1.png", icon_source_url: null });
  });

  it("leaves status checks off for every service in an upgraded database", () => {
    const legacy = new Database(path.join(testDataDir!, "orbitdash.db"));
    applyLegacyV02Schema(legacy);
    legacy.exec(
      `INSERT INTO services VALUES ('svc-1', 'Orbit', 'https://example.com', NULL, NULL, NULL, 1, 1, 1)`
    );
    legacy.close();

    initializeDb({ dataDir: testDataDir! });

    expect(
      getDb()
        .prepare(
          `SELECT check_enabled, check_method, check_target, check_interval, check_ignore_tls
           FROM services WHERE id = ?`
        )
        .get("svc-1")
    ).toEqual({
      check_enabled: 0,
      check_method: "http",
      check_target: null,
      check_interval: 60,
      check_ignore_tls: 0,
    });
    expect(() =>
      getDb().exec("UPDATE services SET check_interval = 5 WHERE id = 'svc-1'")
    ).toThrow();
    expect(() =>
      getDb().exec("UPDATE services SET check_method = 'icmp' WHERE id = 'svc-1'")
    ).toThrow();
  });

  it("gives every service in an upgraded database no external URL, links or tags", () => {
    const legacy = new Database(path.join(testDataDir!, "orbitdash.db"));
    applyLegacyV02Schema(legacy);
    legacy.exec(
      `INSERT INTO services VALUES ('svc-1', 'Orbit', 'https://example.com', NULL, NULL, NULL, 1, 1, 1)`
    );
    legacy.close();

    initializeDb({ dataDir: testDataDir! });

    expect(
      getDb().prepare("SELECT external_url, links, tags FROM services WHERE id = ?").get("svc-1")
    ).toEqual({ external_url: null, links: "[]", tags: "[]" });
    // Links and tags stay JSON arrays.
    expect(() => getDb().exec("UPDATE services SET links = 'admin' WHERE id = 'svc-1'")).toThrow();
    expect(() => getDb().exec(`UPDATE services SET tags = '{}' WHERE id = 'svc-1'`)).toThrow();
  });

  it("adds icon_source_url to databases that already ran the categories migration", () => {
    initializeDb({ dataDir: testDataDir! });
    getDb().exec(`
      ALTER TABLE services DROP COLUMN icon_source_url;
      DELETE FROM schema_migrations WHERE id = 4;
    `);
    closeDb();

    initializeDb({ dataDir: testDataDir! });

    const columns = getDb().prepare("PRAGMA table_info(services)").all() as Array<{
      name: string;
    }>;
    expect(columns.map((column) => column.name)).toContain("icon_source_url");
    expect(
      (
        getDb().prepare("SELECT id FROM schema_migrations ORDER BY id").all() as Array<{
          id: number;
        }>
      ).map((row) => row.id)
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("supports insert, update, and delete flows against the services table", () => {
    initializeDb({ dataDir: testDataDir! });

    const db = getDb();
    const now = Date.now();

    db.prepare(
      `INSERT INTO services (id, name, url, description, icon, category_id, open_in_new_tab, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("svc-1", "Orbit", "https://example.com/orbit", "Dashboard", null, null, 1, now, now);

    expect(db.prepare("SELECT name FROM services WHERE id = ?").get("svc-1")).toEqual({
      name: "Orbit",
    });

    db.prepare("UPDATE services SET name = ?, updated_at = ? WHERE id = ?").run(
      "Orbit Updated",
      now + 1,
      "svc-1"
    );

    expect(db.prepare("SELECT name FROM services WHERE id = ?").get("svc-1")).toEqual({
      name: "Orbit Updated",
    });

    db.prepare("DELETE FROM services WHERE id = ?").run("svc-1");

    expect(db.prepare("SELECT name FROM services WHERE id = ?").get("svc-1")).toBeNull();
  });

  it("enforces basic service invariants in the database schema", () => {
    initializeDb({ dataDir: testDataDir! });

    const db = getDb();
    const now = Date.now();

    expect(() => {
      db.prepare(
        `INSERT INTO services (id, name, url, description, icon, category_id, open_in_new_tab, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("svc-invalid-name", "   ", "https://example.com/orbit", null, null, null, 1, now, now);
    }).toThrow();

    expect(() => {
      db.prepare(
        `INSERT INTO services (id, name, url, description, icon, category_id, open_in_new_tab, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("svc-invalid-tab", "Orbit", "https://example.com/orbit", null, null, null, 2, now, now);
    }).toThrow();

    expect(() => {
      db.prepare(
        `INSERT INTO services (id, name, url, description, icon, category_id, open_in_new_tab, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("svc-bad-category", "Orbit", "https://example.com", null, null, "nope", 1, now, now);
    }).toThrow();
  });

  it("upgrades a 0.2 database to the categories table without losing order", () => {
    const legacy = new Database(path.join(testDataDir!, "orbitdash.db"));
    applyLegacyV02Schema(legacy);
    const insert = legacy.prepare(
      `INSERT INTO services (id, name, url, description, icon, category, open_in_new_tab, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, 1, 1, 1)`
    );
    insert.run("a", "Sonarr", "https://a.test", "Media");
    insert.run("b", "jellyfin", "https://b.test", " Media ");
    insert.run("c", "Proxmox", "https://c.test", "Infra");
    insert.run("d", "Router", "https://d.test", "Network");
    insert.run("e", "Loose", "https://e.test", null);
    insert.run("f", "Odd", "https://f.test", "Uncategorized");
    legacy
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("services.categoryOrder", '["Infra","Media"]');
    legacy.close();

    initializeDb({ dataDir: testDataDir! });
    const db = getDb();

    expect(db.prepare("SELECT name, position FROM categories ORDER BY position").all()).toEqual([
      { name: "Infra", position: 0 },
      { name: "Media", position: 1 },
      { name: "Network", position: 2 },
    ]);
    expect(
      db
        .prepare(
          `SELECT services.name, categories.name AS category, services.position
           FROM services LEFT JOIN categories ON categories.id = services.category_id
           ORDER BY categories.position IS NULL, categories.position, services.position`
        )
        .all()
    ).toEqual([
      { name: "Proxmox", category: "Infra", position: 0 },
      { name: "jellyfin", category: "Media", position: 0 },
      { name: "Sonarr", category: "Media", position: 1 },
      { name: "Router", category: "Network", position: 0 },
      { name: "Loose", category: null, position: 0 },
      { name: "Odd", category: null, position: 1 },
    ]);
    expect(
      db.prepare("SELECT value FROM settings WHERE key = 'services.categoryOrder'").get()
    ).toBeNull();
    const columns = db.prepare("PRAGMA table_info(services)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("category");
  });

  it("tolerates a corrupt saved category order during the upgrade", () => {
    const legacy = new Database(path.join(testDataDir!, "orbitdash.db"));
    applyLegacyV02Schema(legacy);
    legacy
      .prepare(
        `INSERT INTO services (id, name, url, category, open_in_new_tab, created_at, updated_at)
         VALUES ('a', 'B', 'https://b.test', 'Beta', 1, 1, 1),
                ('b', 'A', 'https://a.test', 'Alpha', 1, 1, 1)`
      )
      .run();
    legacy
      .prepare("INSERT INTO settings (key, value) VALUES ('services.categoryOrder', '{')")
      .run();
    legacy.close();

    initializeDb({ dataDir: testDataDir! });
    expect(getDb().prepare("SELECT name FROM categories ORDER BY position").all()).toEqual([
      { name: "Alpha" },
      { name: "Beta" },
    ]);
  });
});
