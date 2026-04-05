import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";

interface ServicesEmptyStateProps {
  mode: "empty" | "search";
  search?: string;
  onAddService: () => void;
  onClearSearch?: () => void;
}

export function ServicesEmptyState({
  mode,
  search,
  onAddService,
  onClearSearch,
}: ServicesEmptyStateProps) {
  if (mode === "search") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-14 text-center">
        <Search className="h-5 w-5 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-semibold">No services match that search</p>
          <p className="text-sm text-muted-foreground">
            Try a different name, category, or URL fragment
            {search?.trim() ? ` for "${search.trim()}".` : "."}
          </p>
        </div>
        {onClearSearch && (
          <Button variant="outline" size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-20 text-center">
      <div className="space-y-1">
        <p className="text-base font-semibold">No services yet</p>
        <p className="text-sm text-muted-foreground">
          Add the apps and tools you want to reach from one place.
        </p>
      </div>
      <Button onClick={onAddService}>
        <Plus className="h-4 w-4" />
        Add your first service
      </Button>
    </div>
  );
}
