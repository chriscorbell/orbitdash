import { cn } from "@/lib/utils";
import type { IntegrationReading } from "@shared/types";

const TONES = {
  good: "text-success",
  warning: "text-warning",
  bad: "text-destructive",
} as const;

/** A card's integration figures in one quiet line, or why they couldn't be read. */
export function IntegrationStats({ reading }: { reading: IntegrationReading }) {
  if (reading.error) {
    return (
      <p className="truncate text-xs text-muted-foreground" title={reading.error}>
        {reading.error}
      </p>
    );
  }
  if (reading.stats.length === 0) return null;
  return (
    // One line: figures that don't fit wrap out of sight whole, instead of being cut off.
    <dl className="flex h-4 min-w-0 flex-wrap gap-x-3 overflow-hidden text-xs leading-tight animate-in fade-in-0 duration-300">
      {reading.stats.map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-1">
          <dt className="text-muted-foreground">{stat.label}</dt>
          <dd
            className={cn(
              "shrink-0 font-mono tabular-nums text-foreground",
              stat.tone && TONES[stat.tone]
            )}
          >
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
