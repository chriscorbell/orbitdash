import { buildApiUrl, requestJson } from "@/lib/api/client";
import {
  importSummarySchema,
  snapshotSchema,
  snapshotsResponseSchema,
  type ImportSummary,
  type Snapshot,
} from "@/lib/api/schemas";

export const BACKUP_EXPORT_URL = buildApiUrl("/api/backup/export");

export async function fetchSnapshots(): Promise<Snapshot[]> {
  const response = await requestJson(
    "/api/backup/snapshots",
    {},
    "Failed to load backups",
    snapshotsResponseSchema
  );
  return response.snapshots;
}

export function createSnapshot(): Promise<Snapshot> {
  return requestJson(
    "/api/backup/snapshots",
    { method: "POST" },
    "Failed to create a backup",
    snapshotSchema
  );
}

/** Sends a previously exported backup file; the server validates it before replacing anything. */
export function importBackup(fileContents: string): Promise<ImportSummary> {
  return requestJson(
    "/api/backup/import",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: fileContents,
    },
    "Failed to import the backup",
    importSummarySchema
  );
}
