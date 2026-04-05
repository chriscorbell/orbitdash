import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";

interface DatabaseInitOptions {
  dataDir?: string;
  dbPath?: string;
  removeExisting?: boolean;
}

interface DatabaseLocation {
  dataDir: string;
  dbPath: string;
}

function resolveDefaultDataDir(): string {
  if (process.env.ORBITDASH_DATA_DIR) {
    return path.resolve(process.env.ORBITDASH_DATA_DIR);
  }

  if (fs.existsSync("/.dockerenv")) {
    return "/data";
  }

  return path.resolve(process.cwd(), "data");
}

function resolveDatabaseLocation(options: DatabaseInitOptions = {}): DatabaseLocation {
  if (options.dbPath) {
    const dbPath = path.resolve(options.dbPath);
    return {
      dataDir: path.dirname(dbPath),
      dbPath,
    };
  }

  const dataDir = path.resolve(options.dataDir ?? currentDataDir);
  return {
    dataDir,
    dbPath: path.join(dataDir, "orbitdash.db"),
  };
}

let currentDataDir = resolveDefaultDataDir();
let currentDbPath = path.join(currentDataDir, "orbitdash.db");

let db: Database | null = null;

function applyPragmas(database: Database): void {
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
}

export function initializeDb(options: DatabaseInitOptions = {}): Database {
  const location = resolveDatabaseLocation(options);
  const locationChanged =
    location.dataDir !== currentDataDir || location.dbPath !== currentDbPath;

  if (db && locationChanged) {
    closeDb();
  }

  currentDataDir = location.dataDir;
  currentDbPath = location.dbPath;

  if (options.removeExisting) {
    closeDb();
    fs.rmSync(currentDbPath, { force: true });
  }

  if (!db) {
    fs.mkdirSync(currentDataDir, { recursive: true });

    db = new Database(currentDbPath);
    applyPragmas(db);
    initSchema(db);
  }

  return db;
}

export function getDb(): Database {
  if (!db) {
    throw new Error("database is not initialized");
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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS services_category_name_idx
    ON services (category, name);
  `);
}

export function getDataDir(): string {
  return currentDataDir;
}

export function getDbPath(): string {
  return currentDbPath;
}

export function isDbInitialized(): boolean {
  return db !== null;
}

export function isDbHealthy(): boolean {
  if (!db) {
    return false;
  }

  try {
    db.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}

export function resetDbForTesting(options: Omit<DatabaseInitOptions, "removeExisting"> = {}): void {
  closeDb();

  const location = resolveDatabaseLocation(options);
  currentDataDir = location.dataDir;
  currentDbPath = location.dbPath;

  fs.rmSync(currentDbPath, { force: true });
  fs.rmSync(currentDataDir, { recursive: true, force: true });
}

export function closeDb(): void {
  if (!db) {
    return;
  }

  db.close();
  db = null;
}
