import { getDataDir, getDb, isDbInitialized } from "../db";
import { createSnapshot, listSnapshots } from "./backup-snapshots";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Takes a nightly snapshot when the newest one is at least a day old. Safe to call often. */
export function runNightlySnapshotIfDue(now: Date = new Date()): boolean {
  if (!isDbInitialized()) {
    return false;
  }

  const dataDir = getDataDir();
  const latestNightly = listSnapshots(dataDir).find((snapshot) => snapshot.reason === "nightly");
  if (latestNightly && now.getTime() - Date.parse(latestNightly.createdAt) < DAY_MS) {
    return false;
  }

  createSnapshot(getDb(), dataDir, "nightly", now);
  return true;
}
