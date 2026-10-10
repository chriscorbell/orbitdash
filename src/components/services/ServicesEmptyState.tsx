import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface ServicesEmptyStateProps {
  /** Left out for guests, who can't add services. */
  onAddService?: () => void;
}

export function ServicesEmptyState({ onAddService }: ServicesEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-20 text-center">
      <div className="space-y-1">
        <p className="text-base font-semibold">No services yet</p>
        {onAddService && (
          <p className="text-sm text-muted-foreground">
            Add the apps and tools you want to reach from one place.
          </p>
        )}
      </div>
      {onAddService && (
        <Button onClick={onAddService}>
          <Plus className="h-4 w-4" />
          Add your first service
        </Button>
      )}
    </div>
  );
}
