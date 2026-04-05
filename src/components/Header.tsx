import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpDown, Columns4, LayoutGrid, ListOrdered, SlidersHorizontal } from "lucide-react";

interface HeaderProps {
  canReorderCategories: boolean;
  columnCount: 4 | 5;
  isCategoryOrderBusy: boolean;
  isReorderMode: boolean;
  showStatsFirst: boolean;
  onToggleGrid: () => void;
  onToggleReorder: () => void;
  onToggleSectionOrder: () => void;
}

export function Header({
  canReorderCategories,
  columnCount,
  isCategoryOrderBusy,
  isReorderMode,
  showStatsFirst,
  onToggleGrid,
  onToggleReorder,
  onToggleSectionOrder,
}: HeaderProps) {
  const isFiveColumn = columnCount === 5;

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <img src="/orbitdash.svg" alt="orbitdash" className="h-7 w-7" />
          <span className="text-lg font-semibold tracking-tight text-foreground">orbitdash</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Layout options">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={onToggleSectionOrder}>
              <ArrowUpDown className="h-4 w-4" />
              {showStatsFirst ? "Show services first" : "Show stats first"}
            </DropdownMenuItem>
            {canReorderCategories && (
              <DropdownMenuItem onClick={onToggleReorder} disabled={isCategoryOrderBusy}>
                <ListOrdered className="h-4 w-4" />
                {isReorderMode ? "Cancel reordering" : "Reorder categories"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onToggleGrid}>
              {isFiveColumn ? <LayoutGrid className="h-4 w-4" /> : <Columns4 className="h-4 w-4" />}
              {isFiveColumn ? "Switch to 4 columns" : "Switch to 5 columns"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
