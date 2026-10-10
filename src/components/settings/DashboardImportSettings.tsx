import { lazy, Suspense, useRef, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fetchCategories } from "@/lib/api/categories";
import { previewImport } from "@/lib/api/imports";
import { queryKeys } from "@/lib/query-client";
import { loadImportDialog } from "@/components/settings/settings-preload";
import type { ImportPreview } from "@shared/types";

const ImportDialog = lazy(() =>
  loadImportDialog().then((module) => ({ default: module.ImportDialog }))
);

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Brings services over from Homepage, Dashy, Homer, Homarr or browser bookmarks. */
export function DashboardImportSettings() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: fetchCategories,
  });

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is too large to import.");
      return;
    }

    setReading(true);
    setError(null);
    try {
      const [result] = await Promise.all([previewImport(await file.text()), loadImportDialog()]);
      if (result.groups.length === 0) {
        setError(result.warnings[0] ?? "That file has no services to import.");
      } else {
        setPreview(result);
      }
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Couldn't read that file");
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label>Import from another dashboard</Label>
          <p className="text-muted-foreground text-sm">
            Homepage, Dashy, Homer, Homarr, or browser bookmarks. You pick what to add.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={reading}
          onClick={() => fileInputRef.current?.click()}
        >
          {reading ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileUp aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {reading ? "Reading…" : "Choose file"}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml,.json,.html,.htm,application/json,text/yaml,text/html"
        className="hidden"
        aria-label="Dashboard file to import"
        onChange={(event) => void handleFileChange(event)}
      />

      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}

      {preview && (
        <Suspense fallback={null}>
          <ImportDialog
            categories={categories.map((category) => category.name)}
            preview={preview}
            onClose={() => setPreview(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
