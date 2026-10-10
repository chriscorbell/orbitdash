import type { BulkChecksChange } from "@/components/board/useBulkServiceActions";
import { formatCheckInterval } from "@/components/services/status-check-options";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import { CHECK_INTERVAL_PRESETS_S } from "@shared/status";
import type { Category } from "@shared/types";
import { Activity, CircleOff, FolderInput, Trash2, X } from "lucide-react";

interface BulkActionBarProps {
  busy: boolean;
  categories: readonly Category[];
  count: number;
  onChecks: (change: BulkChecksChange) => void;
  onClear: () => void;
  onDelete: () => void;
  onMove: (category: Category | null) => void;
}

/**
 * Floats at the bottom of the screen while cards are selected in edit mode: move them to a
 * category, turn their status checks on or off or set the interval, or delete them (with Undo).
 * Phones show the actions as icons, named for screen readers.
 */
export function BulkActionBar({
  busy,
  categories,
  count,
  onChecks,
  onClear,
  onDelete,
  onMove,
}: BulkActionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Selected services"
      className="fixed bottom-0 left-1/2 z-30 mb-4 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClear();
      }}
    >
      <p aria-live="polite" className="px-2 text-sm font-medium whitespace-nowrap tabular-nums">
        {count} selected
      </p>
      <Separator orientation="vertical" className="h-5 self-center" />

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            className="pointer-coarse:h-9"
          >
            <FolderInput aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Move</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" collisionPadding={12} className="w-64">
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {categories.map((category) => (
            <DropdownMenuItem key={category.id} onSelect={() => onMove(category)}>
              <span className="truncate">{category.name}</span>
            </DropdownMenuItem>
          ))}
          {categories.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => onMove(null)}>
            {UNCATEGORIZED_CATEGORY}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            className="pointer-coarse:h-9"
          >
            <Activity aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Status checks</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" collisionPadding={12} className="w-36">
          <DropdownMenuItem onSelect={() => onChecks({ check_enabled: true })}>
            <Activity aria-hidden="true" className="h-3.5 w-3.5" />
            Turn on
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onChecks({ check_enabled: false })}>
            <CircleOff aria-hidden="true" className="h-3.5 w-3.5" />
            Turn off
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel inset>Check every</DropdownMenuLabel>
          {CHECK_INTERVAL_PRESETS_S.map((seconds) => (
            <DropdownMenuItem
              key={seconds}
              inset
              onSelect={() => onChecks({ check_interval: seconds })}
            >
              {formatCheckInterval(seconds)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        className="text-destructive hover:text-destructive pointer-coarse:h-9"
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Delete</span>
      </Button>

      <Separator orientation="vertical" className="h-5 self-center" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Clear selection"
        className="text-muted-foreground pointer-coarse:size-9"
        onClick={onClear}
      >
        <X />
      </Button>
    </div>
  );
}
