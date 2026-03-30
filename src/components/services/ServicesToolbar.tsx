import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Columns4, LayoutGrid, Plus, Search, SlidersHorizontal } from "lucide-react";

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
    const layoutLabel = isFiveColumn ? "5-column layout" : "4-column layout";

    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Services</h2>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {servicesCount > 0 && (
                    <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search services…"
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-8 w-full pl-8 text-sm"
                            aria-label="Search services"
                        />
                    </div>
                )}

                {canReorderCategories && (
                    <Button
                        size="sm"
                        variant={isReorderMode ? "secondary" : "outline"}
                        onClick={onToggleReorder}
                        disabled={isCategoryOrderBusy}
                        aria-label={isReorderMode ? "Done organizing categories" : "Organize categories"}
                        title={isReorderMode ? "Done organizing categories" : "Organize categories"}
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        <span>{isReorderMode ? "Done" : "Organize"}</span>
                    </Button>
                )}

                <Button
                    size="sm"
                    variant="outline"
                    onClick={onToggleGrid}
                    aria-label={`Switch layout, currently ${layoutLabel}`}
                    title={`Switch layout, currently ${layoutLabel}`}
                >
                    {isFiveColumn ? (
                        <LayoutGrid className="h-4 w-4" />
                    ) : (
                        <Columns4 className="h-4 w-4" />
                    )}
                    <span>{layoutLabel}</span>
                </Button>

                <Button
                    size="sm"
                    onClick={onAddService}
                    aria-label="Add service"
                    title="Add service"
                >
                    <Plus className="h-4 w-4" />
                    <span>Add service</span>
                </Button>
            </div>
        </div>
    );
}
