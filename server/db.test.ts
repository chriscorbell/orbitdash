import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { getBoard } from "./board.ts";
import { openDatabase, V1_BACKUP_NAME } from "./db.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orbitdash-db-"));
  dirs.push(dir);
  return path.join(dir, "orbitdash.db");
}

/** An orbitdash 1.0 database: categories in their own table, plus tables 2.x drops. */
function writeV1(file: string) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL);
    INSERT INTO schema_migrations VALUES (12, 'service-links-tags', 0);
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, position INTEGER NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE services (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, description TEXT, icon TEXT,
      open_in_new_tab INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      position INTEGER NOT NULL DEFAULT 0, links TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE status_results (service_id TEXT REFERENCES services(id), ok INTEGER);
    CREATE VIEW recent_status AS SELECT * FROM status_results;
    INSERT INTO categories VALUES ('c-media', 'Media', 1, 0, 0), ('c-apps', 'Apps', 0, 0, 0);
    INSERT INTO services (id, name, url, icon, open_in_new_tab, created_at, updated_at, category_id, position) VALUES
      ('plex', 'Plex', 'http://plex:32400/', 'plex-1.svg', 1, 0, 0, 'c-media', 1),
      ('jelly', 'Jellyfin', 'http://jelly:8096/', NULL, 0, 0, 0, 'c-media', 0),
      ('git', 'Gitea', 'https://git.example/', 'git.png', 1, 0, 0, 'c-apps', 0),
      ('loose', 'Loose', 'https://loose.example/', NULL, 1, 0, 0, NULL, 0);
    INSERT INTO settings VALUES ('theme', 'dark');
    INSERT INTO status_results VALUES ('plex', 1);
  `);
  db.close();
}

describe("openDatabase", () => {
  it("creates an empty board on a fresh install", () => {
    const db = openDatabase(tempFile(), () => {});
    expect(getBoard(db)).toEqual({ categories: [], links: [] });
    db.close();
  });

  it("upgrades a 1.0 database, keeping links, icons, categories and their order", () => {
    const file = tempFile();
    writeV1(file);
    const logs: string[] = [];
    const db = openDatabase(file, (line) => logs.push(line));

    const board = getBoard(db);
    expect(board.categories).toEqual([
      { id: "c-apps", name: "Apps" },
      { id: "c-media", name: "Media" },
    ]);
    expect(board.links.map((link) => [link.name, link.categoryId, link.icon, link.newTab])).toEqual(
      [
        ["Loose", null, null, true],
        ["Gitea", "c-apps", "git.png", true],
        ["Jellyfin", "c-media", null, false],
        ["Plex", "c-media", "plex-1.svg", true],
      ]
    );

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual(["categories", "links"]);
    expect(logs.join("\n")).toContain("kept 4 links in 2 categories");
    db.close();
  });

  it("keeps an untouched copy of the 1.x database and upgrades only once", () => {
    const file = tempFile();
    writeV1(file);
    openDatabase(file, () => {}).close();

    const backup = new DatabaseSync(path.join(path.dirname(file), V1_BACKUP_NAME));
    expect(backup.prepare("SELECT count(*) AS n FROM services").get()).toEqual({ n: 4 });
    expect(backup.prepare("SELECT value FROM settings").get()).toEqual({ value: "dark" });
    backup.close();

    const logs: string[] = [];
    const db = openDatabase(file, (line) => logs.push(line));
    expect(logs).toEqual([]);
    expect(getBoard(db).links).toHaveLength(4);
    db.close();
  });

  it("upgrades an early 1.x database that kept categories as text on each service", () => {
    const file = tempFile();
    const old = new DatabaseSync(file);
    old.exec(`
      CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at INTEGER);
      CREATE TABLE services (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, description TEXT, icon TEXT,
        category TEXT, open_in_new_tab INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      INSERT INTO services VALUES
        ('b', 'beta', 'https://b.example/', NULL, NULL, ' Tools ', 1, 0, 0),
        ('a', 'Alpha', 'https://a.example/', NULL, 'a.svg', 'Tools', 1, 0, 0),
        ('m', 'Movies', 'https://m.example/', NULL, NULL, 'Media', 0, 0, 0),
        ('n', 'None', 'https://n.example/', NULL, NULL, '  ', 1, 0, 0);
    `);
    old.close();

    const db = openDatabase(file, () => {});
    const board = getBoard(db);
    expect(board.categories.map((category) => category.name)).toEqual(["Media", "Tools"]);
    expect(board.links.map((link) => link.name)).toEqual(["None", "Movies", "Alpha", "beta"]);
    db.close();
  });
});
