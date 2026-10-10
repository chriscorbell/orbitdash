import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Download, History, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BACKUP_EXPORT_URL, createSnapshot, fetchSnapshots, importBackup } from "@/lib/api/backup";
import { formatRelativeAge } from "@/lib/format";
import type { Snapshot } from "@/lib/api/schemas";

interface PendingImport {
  contents: string;
  fileName: string;
  serviceCount: number;
}

function describeLatest(snapshots: Snapshot[] | null): string {
  if (snapshots === null) {
    return "Checking for snapshots…";
  }
  if (snapshots.length === 0) {
    return "No snapshots yet. One is taken nightly and before every upgrade.";
  }
  return `Last snapshot ${formatRelativeAge(snapshots[0].createdAt)}. Stored in the backups folder of the data directory.`;
}

/** Reads just enough of a picked file to confirm it is an orbitdash backup before sending it. */
function inspectBackupFile(contents: string): number | null {
  try {
    const parsed = JSON.parse(contents) as { format?: unknown; services?: unknown };
    if (parsed.format !== "orbitdash-backup" || !Array.isArray(parsed.services)) {
      return null;
    }
    return parsed.services.length;
  } catch {
    return null;
  }
}

export function BackupSettingsSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [busy, setBusy] = useState<"import" | "snapshot" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchSnapshots()
      .then((result) => {
        if (active) setSnapshots(result);
      })
      .catch(() => {
        if (active) setSnapshots([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const contents = await file.text();
    const serviceCount = inspectBackupFile(contents);
    if (serviceCount === null) {
      setError("That file isn't an orbitdash backup.");
      return;
    }

    setError(null);
    setPendingImport({ contents, fileName: file.name, serviceCount });
  };

  const handleImport = async () => {
    if (!pendingImport) {
      return;
    }

    setBusy("import");
    setError(null);
    try {
      await importBackup(pendingImport.contents);
      window.location.reload();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Failed to import the backup");
      setBusy(null);
    }
  };

  const handleSnapshot = async () => {
    setBusy("snapshot");
    setError(null);
    try {
      const snapshot = await createSnapshot();
      setSnapshots((current) => [snapshot, ...(current ?? [])]);
    } catch (snapshotError) {
      setError(
        snapshotError instanceof Error ? snapshotError.message : "Failed to create a backup"
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <Label>Backups</Label>
        <p className="text-muted-foreground text-sm">{describeLatest(snapshots)}</p>
      </div>

      {pendingImport ? (
        <div className="space-y-3 rounded-md bg-muted/60 p-3" role="alert">
          <p className="text-sm">
            Replace everything with <span className="font-medium">{pendingImport.fileName}</span>?
            It has {pendingImport.serviceCount}{" "}
            {pendingImport.serviceCount === 1 ? "service" : "services"}. A snapshot of the current
            data is saved first.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy === "import"}
              onClick={() => setPendingImport(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy === "import"}
              onClick={() => void handleImport()}
            >
              {busy === "import" ? "Importing…" : "Replace"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={BACKUP_EXPORT_URL} download>
              <Download className="h-3.5 w-3.5" />
              Export
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy === "snapshot"}
            onClick={() => void handleSnapshot()}
          >
            <History className="h-3.5 w-3.5" />
            {busy === "snapshot" ? "Saving…" : "Snapshot"}
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Backup file to import"
        onChange={(event) => void handleFileChange(event)}
      />

      {error && <p className="text-destructive text-sm font-medium">{error}</p>}
    </div>
  );
}
