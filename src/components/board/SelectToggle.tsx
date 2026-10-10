import type { SelectionState } from "@/lib/board-selection";
import { cn } from "@/lib/utils";
import { Check, Minus } from "lucide-react";

interface SelectToggleProps {
  checked: SelectionState;
  className?: string;
  label: string;
  /** `range` is true for a shift-click, which selects a run of cards. */
  onToggle: (range: boolean) => void;
}

/**
 * A checkbox for edit mode's selection. A plain button rather than Radix's checkbox, so a
 * shift-click can be told apart; it looks like the shared Checkbox.
 */
export function SelectToggle({ checked, className, label, onToggle }: SelectToggleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked === "indeterminate" ? "mixed" : checked}
      aria-label={label}
      data-checked={checked ? "" : undefined}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground pointer-coarse:size-5",
        className
      )}
      // Keep presses from starting a drag of the card underneath.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => onToggle(event.shiftKey)}
    >
      {checked === "indeterminate" ? (
        <Minus aria-hidden="true" className="h-3 w-3" />
      ) : checked ? (
        <Check aria-hidden="true" className="h-3 w-3" />
      ) : null}
    </button>
  );
}
