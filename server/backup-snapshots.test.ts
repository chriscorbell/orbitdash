import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import { closeDb, getDb, initializeDb, resetDbForTesting } from "./db";
import { cancelAllJobs, getScheduledJobNames, scheduleJob } from "./jobs";
import { runNightlySnapshotIfDue } from "./services/backup-schedule";
import { createSnapshot, listSnapshots, pruneSnapshots } from "./services/backup-snapshots";
import { createTestDataDir } from "./test-utils";

let testDataDir: string;

beforeEach(() => {
  closeDb();
  testDataDir = createTestDataDir("orbitdash-snapshots-");
});

afterEach(() => {
  cancelAllJobs();
  delete process.env.ORBITDASH_BACKUP_KEEP;
  closeDb();
  resetDbForTesting({ dataDir: testDataDir });
});

function writeLegacyV1Database(dbPath: string) {
  const legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE metrics_samples (ts INTEGER PRIMARY KEY, cpu REAL NOT NULL, ram REAL NOT NULL, disk REAL NOT NULL);
    CREATE TABLE services (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, description TEXT, icon TEXT,
      category TEXT, open_in_new_tab INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO services VALUES ('a', 'Legacy', 'https://legacy.test', NULL, NULL, 'Old', 1, 1, 1);
  `);
  legacy.close();
}

describe("backup snapshots", () => {
  it("does not snapshot a brand-new database", () => {
    initializeDb({ dataDir: testDataDir });
    expect(listSnapshots(testDataDir)).toEqual([]);
  });

  it("snapshots an existing database before applying pending migrations", () => {
    fs.mkdirSync(path.join(testDataDir, "icons"), { recursive: true });
    fs.writeFileSync(path.join(testDataDir, "icons", "a.svg"), "<svg></svg>");
    writeLegacyV1Database(path.join(testDataDir, "orbitdash.db"));

    initializeDb({ dataDir: testDataDir });

    const [snapshot] = listSnapshots(testDataDir);
    expect(snapshot.reason).toBe("pre-migration");

    const snapshotDir = path.join(testDataDir, "backups", snapshot.name);
    expect(fs.readFileSync(path.join(snapshotDir, "icons", "a.svg"), "utf-8")).toBe("<svg></svg>");

    // The snapshot holds the database as it was before the upgrade.
    const copy = new Database(path.join(snapshotDir, "orbitdash.db"), { readonly: true });
    const tables = copy
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((table) => table.name)).toContain("metrics_samples");
    copy.close();

    // Reopening an up-to-date database takes no further snapshot.
    closeDb();
    initializeDb({ dataDir: testDataDir });
    expect(listSnapshots(testDataDir)).toHaveLength(1);
  });

  it("keeps only the newest snapshots", () => {
    initializeDb({ dataDir: testDataDir });
    process.env.ORBITDASH_BACKUP_KEEP = "2";

    const base = Date.parse("2026-10-01T00:00:00.000Z");
    for (let day = 0; day < 4; day++) {
      createSnapshot(getDb(), testDataDir, "manual", new Date(base + day * 86_400_000));
    }

    expect(listSnapshots(testDataDir).map((snapshot) => snapshot.createdAt)).toEqual([
      "2026-10-04T00:00:00.000Z",
      "2026-10-03T00:00:00.000Z",
    ]);

    pruneSnapshots(testDataDir, 1);
    expect(listSnapshots(testDataDir)).toHaveLength(1);
  });

  it("gives snapshots taken in the same millisecond distinct names", () => {
    initializeDb({ dataDir: testDataDir });
    const now = new Date("2026-10-01T12:00:00.000Z");

    const first = createSnapshot(getDb(), testDataDir, "manual", now);
    const second = createSnapshot(getDb(), testDataDir, "manual", now);

    expect(first.name).not.toBe(second.name);
  });

  it("ignores unrelated and half-written entries in the backups directory", () => {
    initializeDb({ dataDir: testDataDir });
    const backupsDir = path.join(testDataDir, "backups");
    fs.mkdirSync(path.join(backupsDir, "notes"), { recursive: true });
    fs.mkdirSync(path.join(backupsDir, "2026-10-01T00-00-00-000Z-manual.partial"));
    fs.mkdirSync(path.join(backupsDir, "2026-10-01T00-00-00-000Z-unknown"));
    fs.mkdirSync(path.join(backupsDir, "2026-10-02T00-00-00-000Z-manual"));

    expect(listSnapshots(testDataDir)).toEqual([]);
  });

  it("takes a nightly snapshot only when the last one is a day old", () => {
    expect(runNightlySnapshotIfDue()).toBe(false);

    initializeDb({ dataDir: testDataDir });
    const now = new Date("2026-10-10T03:00:00.000Z");

    expect(runNightlySnapshotIfDue(now)).toBe(true);
    expect(runNightlySnapshotIfDue(new Date(now.getTime() + 60 * 60 * 1000))).toBe(false);
    expect(runNightlySnapshotIfDue(new Date(now.getTime() + 25 * 60 * 60 * 1000))).toBe(true);
    expect(listSnapshots(testDataDir).map((snapshot) => snapshot.reason)).toEqual([
      "nightly",
      "nightly",
    ]);
  });
});

describe("job scheduler", () => {
  it("runs jobs after the initial delay and keeps running on failure", async () => {
    let runs = 0;
    scheduleJob(
      "flaky",
      () => {
        runs += 1;
        throw new Error("boom");
      },
      { initialDelayMs: 1, intervalMs: 5 }
    );

    expect(getScheduledJobNames()).toEqual(["flaky"]);
    await Bun.sleep(40);
    expect(runs).toBeGreaterThan(1);

    cancelAllJobs();
    expect(getScheduledJobNames()).toEqual([]);
  });
});
