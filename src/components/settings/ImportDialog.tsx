import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ServiceIcon } from "@/components/services/ServiceIcon";
import { applyImport } from "@/lib/api/imports";
import {
  FORMAT_NAMES,
  groupState,
  initialSelection,
  renameGroupCategory,
  selectedServices,
  serviceKey,
  toggleGroup,
  toggleService,
  type ImportSelection,
} from "@/lib/import-selection";
import { hostOf } from "@/lib/palette";
import { queryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import type { ImportPreview, ImportResult } from "@shared/types";

interface ImportDialogProps {
  /** Existing category names, suggested for each group. */
  categories: readonly string[];
  preview: ImportPreview;
  onClose: () => void;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Shows what a file from another dashboard would add, lets you pick, then adds it. */
export function ImportDialog({ categories, preview, onClose }: ImportDialogProps) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<ImportSelection>(() => initialSelection(preview));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const picked = selectedServices(selection, preview);
  const total = preview.groups.reduce((sum, group) => sum + group.services.length, 0);
  const duplicates = preview.groups.flatMap((group) => group.services).filter((s) => s.duplicate);

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await applyImport(picked));
      // This tab made the change, so its own event is skipped; refresh here.
      void queryClient.invalidateQueries({ queryKey: queryKeys.services });
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-xl">
        {result ? (
          <ImportFinished result={result} onClose={onClose} />
        ) : (
          <>
            <DialogHeader className="p-6 pb-4">
              <DialogTitle>Import from {FORMAT_NAMES[preview.format]}</DialogTitle>
              <DialogDescription>
                {plural(total, "service")} in {plural(preview.groups.length, "group")}.
                {duplicates.length > 0 &&
                  ` ${plural(duplicates.length, "link")} already on your dashboard ${duplicates.length === 1 ? "starts" : "start"} unticked.`}
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto overscroll-contain border-y px-6 py-4">
              {preview.warnings.length > 0 && <ImportWarnings warnings={preview.warnings} />}
              <datalist id="import-category-suggestions">
                {categories.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <div className="space-y-5">
                {preview.groups.map((_, groupIndex) => (
                  <ImportGroup
                    key={groupIndex}
                    disabled={busy}
                    groupIndex={groupIndex}
                    preview={preview}
                    selection={selection}
                    onChange={setSelection}
                  />
                ))}
              </div>
            </div>

            <DialogFooter className="items-center p-4 sm:justify-between">
              <p className="text-muted-foreground text-sm max-sm:hidden" aria-live="polite">
                {picked.length} of {total} picked
              </p>
              {error && (
                <p role="alert" className="text-destructive text-sm font-medium sm:hidden">
                  {error}
                </p>
              )}
              <div className="flex gap-2 max-sm:flex-col-reverse max-sm:[&>*]:w-full">
                <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy || picked.length === 0}
                  onClick={() => void handleImport()}
                >
                  {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                  {busy ? "Importing…" : `Import ${plural(picked.length, "service")}`}
                </Button>
              </div>
            </DialogFooter>
            {error && (
              <p
                role="alert"
                className="text-destructive px-4 pb-4 text-sm font-medium max-sm:hidden"
              >
                {error}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportWarnings({ warnings }: { warnings: readonly string[] }) {
  return (
    <details className="group mb-5 rounded-lg bg-muted/50 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground select-none [&::-webkit-details-marker]:hidden">
        <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
        {plural(warnings.length, "note")} about this file
      </summary>
      <ul className="space-y-1 px-3 pb-3 pl-9 text-muted-foreground">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </details>
  );
}

interface ImportGroupProps {
  disabled: boolean;
  groupIndex: number;
  preview: ImportPreview;
  selection: ImportSelection;
  onChange: (selection: ImportSelection) => void;
}

function ImportGroup({ disabled, groupIndex, preview, selection, onChange }: ImportGroupProps) {
  const id = useId();
  const group = preview.groups[groupIndex];
  const state = groupState(selection, preview, groupIndex);

  return (
    <section aria-labelledby={`${id}-name`} className="space-y-1.5">
      <div className="flex items-center gap-3">
        <Checkbox
          aria-label={`Import all of ${group.name}`}
          checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
          disabled={disabled}
          onCheckedChange={() => onChange(toggleGroup(selection, preview, groupIndex))}
        />
        <h3 id={`${id}-name`} className="sr-only">
          {group.name}
        </h3>
        <Input
          aria-label={`Category for ${group.name}`}
          list="import-category-suggestions"
          placeholder="Uncategorized"
          value={selection.categories[groupIndex] ?? ""}
          disabled={disabled}
          maxLength={100}
          onChange={(event) =>
            onChange(renameGroupCategory(selection, groupIndex, event.target.value))
          }
          className="h-8 font-medium"
        />
      </div>
      <ul className="space-y-0.5">
        {group.services.map((service, serviceIndex) => {
          const key = serviceKey(groupIndex, serviceIndex);
          const checkboxId = `${id}-${serviceIndex}`;
          const checked = selection.picked.has(key);
          return (
            <li key={key}>
              <label
                htmlFor={checkboxId}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-0 py-1.5 transition-opacity",
                  !checked && "opacity-60"
                )}
              >
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={() => onChange(toggleService(selection, key))}
                />
                <ServiceIcon className="h-7 w-7" name="" src={service.iconUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{service.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {hostOf(service.url)}
                  </span>
                </span>
                {service.duplicate && (
                  <span className="text-muted-foreground shrink-0 rounded-md border px-1.5 py-0.5 text-[11px]">
                    Already added
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ImportFinished({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  const problems = result.iconFailures > 0 || result.failed.length > 0;
  return (
    <>
      <DialogHeader className={cn("p-6", problems && "pb-4")}>
        <DialogTitle>
          {result.created > 0 ? `Added ${plural(result.created, "service")}` : "Nothing was added"}
        </DialogTitle>
        {result.snapshot && (
          <DialogDescription>A snapshot of your dashboard was saved first.</DialogDescription>
        )}
      </DialogHeader>
      {problems && (
        <div className="animate-in fade-in-0 space-y-3 overflow-y-auto border-y px-6 py-4 text-sm duration-300">
          {result.iconFailures > 0 && (
            <p className="text-muted-foreground">
              {plural(result.iconFailures, "icon")} couldn't be downloaded. Those services were
              added without one; edit them to pick an icon.
            </p>
          )}
          {result.failed.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-medium">These couldn't be added:</p>
              <ul className="text-muted-foreground space-y-1">
                {result.failed.map((failure, index) => (
                  <li key={index}>
                    {failure.name}: {failure.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <DialogFooter className={cn("p-4", !problems && "pt-0")}>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
