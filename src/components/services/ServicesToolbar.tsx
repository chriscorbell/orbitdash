import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Columns4, LayoutGrid, Plus, Search, Settings2 } from "lucide-react";

interface ServicesToolbarProps {
    canReorderCategories: boolean;
    columnCount: 4 | 5;
    isCategoryOrderBusy: boolean;
    isReorderMode: boolean;
    search: string;
    servicesCount: number;
    onAddService: () => void;
    onSearchChange: (value: string) => void;
    onToggleGrid: () => void;
    onToggleReorder: () => void;
}

export function ServicesToolbar({
    canReorderCategories,
    columnCount,
    isCategoryOrderBusy,
    isReorderMode,
    search,
    servicesCount,
    onAddService,
    onSearchChange,
    onToggleGrid,
    onToggleReorder,
}: ServicesToolbarProps) {
    const isFiveColumn = columnCount === 5;

    return (
        <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Services</h2>
            <div className="flex flex-wrap items-center gap-2">
                {servicesCount > 0 && (
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search services…"
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-8 w-48 pl-8 text-sm"
                        />
                    </div>
                )}
                {canReorderCategories && (
                    <Button
                        size="sm"
                        variant={isReorderMode ? "secondary" : "outline"}
                        className="px-2"
                        onClick={onToggleReorder}
                        disabled={isCategoryOrderBusy}
                        aria-label={isReorderMode ? "Cancel category reordering" : "Reorder categories"}
                        title={isReorderMode ? "Cancel category reordering" : "Reorder categories"}
                    >
                        <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="outline"
                    className="px-2"
                    onClick={onToggleGrid}
                    aria-label={isFiveColumn ? "Switch to 4-column grid" : "Switch to 5-column grid"}
                    title={isFiveColumn ? "Switch to 4-column grid" : "Switch to 5-column grid"}
                >
                    {isFiveColumn ? (
                        <LayoutGrid className="h-4 w-4" />
                    ) : (
                        <Columns4 className="h-4 w-4" />
                    )}
                </Button>
                <Button
                    size="sm"
                    className="px-2"
                    onClick={onAddService}
                    aria-label="Add service"
                    title="Add service"
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
