import type { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";

export type SnapshotReason = "manual" | "nightly" | "pre-import" | "pre-migration";

export interface SnapshotInfo {
  createdAt: string;
  name: string;
  reason: SnapshotReason;
  sizeBytes: number;
}

const BACKUPS_DIR_NAME = "backups";
const SNAPSHOT_DB_NAME = "orbitdash.db";
const SNAPSHOT_REASONS: readonly SnapshotReason[] = [
  "manual",
  "nightly",
  "pre-import",
  "pre-migration",
];
const SNAPSHOT_NAME_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-([a-z-]+)$/;
const DEFAULT_KEEP = 7;

export function getBackupsDir(dataDir: string): string {
  return path.join(dataDir, BACKUPS_DIR_NAME);
}

export function getSnapshotKeepCount(): number {
  const parsed = Number.parseInt(process.env.ORBITDASH_BACKUP_KEEP ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_KEEP;
}

function formatSnapshotTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, "-").replace(".", "-");
}

function parseSnapshotTimestamp(value: string): string {
  // 2026-10-10T01-30-00-000Z -> 2026-10-10T01:30:00.000Z
  const [datePart, timePart] = value.split("T");
  const [hours, minutes, seconds, millisWithZone] = timePart.split("-");
  return `${datePart}T${hours}:${minutes}:${seconds}.${millisWithZone}`;
}

function directorySize(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    total += entry.isDirectory() ? directorySize(entryPath) : fs.statSync(entryPath).size;
  }
  return total;
}

function readSnapshotInfo(backupsDir: string, name: string): SnapshotInfo | null {
  const match = SNAPSHOT_NAME_PATTERN.exec(name);
  if (!match || !SNAPSHOT_REASONS.includes(match[2] as SnapshotReason)) {
    return null;
  }

  const snapshotDir = path.join(backupsDir, name);
  if (!fs.existsSync(path.join(snapshotDir, SNAPSHOT_DB_NAME))) {
    return null;
  }

  return {
    createdAt: parseSnapshotTimestamp(match[1]),
    name,
    reason: match[2] as SnapshotReason,
    sizeBytes: directorySize(snapshotDir),
  };
}

/** Snapshots on disk, newest first. */
export function listSnapshots(dataDir: string): SnapshotInfo[] {
  const backupsDir = getBackupsDir(dataDir);
  if (!fs.existsSync(backupsDir)) {
    return [];
  }

  return fs
    .readdirSync(backupsDir)
    .map((name) => readSnapshotInfo(backupsDir, name))
    .filter((snapshot): snapshot is SnapshotInfo => snapshot !== null)
    .sort((left, right) => right.name.localeCompare(left.name));
}

export function pruneSnapshots(dataDir: string, keep: number = getSnapshotKeepCount()): void {
  const backupsDir = getBackupsDir(dataDir);
  for (const snapshot of listSnapshots(dataDir).slice(keep)) {
    fs.rmSync(path.join(backupsDir, snapshot.name), { recursive: true, force: true });
  }
}

/**
 * Writes a consistent copy of the database (VACUUM INTO works while the app keeps running) plus
 * the icons directory into backups/<timestamp>-<reason>/. The copy is built under a temporary name
 * and renamed into place, so a crash never leaves a half-written snapshot that looks complete.
 */
export function createSnapshot(
  db: Database,
  dataDir: string,
  reason: SnapshotReason,
  now: Date = new Date()
): SnapshotInfo {
  const backupsDir = getBackupsDir(dataDir);
  fs.mkdirSync(backupsDir, { recursive: true });

  let name = `${formatSnapshotTimestamp(now)}-${reason}`;
  for (let attempt = 1; fs.existsSync(path.join(backupsDir, name)); attempt++) {
    name = `${formatSnapshotTimestamp(new Date(now.getTime() + attempt))}-${reason}`;
  }

  const finalDir = path.join(backupsDir, name);
  const partialDir = `${finalDir}.partial`;
  fs.rmSync(partialDir, { recursive: true, force: true });
  fs.mkdirSync(partialDir, { recursive: true });

  try {
    db.prepare("VACUUM INTO ?").run(path.join(partialDir, SNAPSHOT_DB_NAME));

    const iconsDir = path.join(dataDir, "icons");
    if (fs.existsSync(iconsDir)) {
      fs.cpSync(iconsDir, path.join(partialDir, "icons"), { recursive: true });
    }

    fs.renameSync(partialDir, finalDir);
  } catch (error) {
    fs.rmSync(partialDir, { recursive: true, force: true });
    throw error;
  }

  pruneSnapshots(dataDir);
  return readSnapshotInfo(backupsDir, name)!;
}
