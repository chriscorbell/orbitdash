import { Check } from "lucide-react";
import type { CategoryOrderSaveState } from "@/hooks/useCategoryOrder";

interface CategoryOrderSaveStatusProps {
  state: CategoryOrderSaveState;
}

/** Inline "Saving…" / "Saved" note for the category order list. Errors render separately. */
export function CategoryOrderSaveStatus({ state }: CategoryOrderSaveStatusProps) {
  return (
    <span role="status" className="text-xs font-medium">
      {state === "saving" && (
        // Delayed so quick LAN saves go straight to "Saved" without a flash.
        <span className="text-muted-foreground animate-in fade-in-0 delay-300 fill-mode-backwards">
          Saving…
        </span>
      )}
      {state === "saved" && (
        <span className="inline-flex items-center gap-1 text-emerald-500 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
          <Check className="size-3" aria-hidden="true" />
          Saved
        </span>
      )}
    </span>
  );
}
