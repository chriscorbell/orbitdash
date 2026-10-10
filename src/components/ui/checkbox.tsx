import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Checked and mixed share one look; the indicator shows a check or a dash. */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  const mixed = props.checked === "indeterminate";
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      // Mixed takes the checked styles too (see the data-checked variant in index.css).
      data-checked={mixed ? "" : undefined}
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground pointer-coarse:size-5",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator">
        {mixed ? <MinusIcon className="h-3 w-3" /> : <CheckIcon className="h-3 w-3" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
