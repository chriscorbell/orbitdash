import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.ORBITDASH_DATA_DIR || "./data";
const DB_PATH = path.join(DATA_DIR, "orbitdash.db");

let db: Database;

export function getDb(): Database {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    db = new Database(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics_samples (
      ts INTEGER PRIMARY KEY,
      cpu REAL NOT NULL,
      ram REAL NOT NULL,
      disk REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      category TEXT,
      open_in_new_tab INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

export function getDataDir(): string {
  return DATA_DIR;
}
