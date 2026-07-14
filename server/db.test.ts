import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs";
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
      "schema_migrations",
      "services",
      "settings",
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
    ]);
  });

  it("supports insert, update, and delete flows against the services table", () => {
    initializeDb({ dataDir: testDataDir! });

    const db = getDb();
    const now = Date.now();

    db.prepare(
      `INSERT INTO services (id, name, url, description, icon, category, open_in_new_tab, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("svc-1", "Orbit", "https://example.com/orbit", "Dashboard", null, "Infra", 1, now, now);

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
        `INSERT INTO services (id, name, url, description, icon, category, open_in_new_tab, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("svc-invalid-name", "   ", "https://example.com/orbit", null, null, null, 1, now, now);
    }).toThrow();

    expect(() => {
      db.prepare(
        `INSERT INTO services (id, name, url, description, icon, category, open_in_new_tab, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("svc-invalid-tab", "Orbit", "https://example.com/orbit", null, null, null, 2, now, now);
    }).toThrow();
  });
});
