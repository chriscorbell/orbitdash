import { lazy, Suspense } from "react";
import { Cpu, HardDrive, MemoryStick, type LucideIcon } from "lucide-react";
import { Sparkline } from "@/components/stats/Sparkline";
import { useAlerts } from "@/hooks/useAlerts";
import { useMetrics } from "@/hooks/useMetrics";
import { useTweenedNumber } from "@/hooks/useTweenedNumber";
import { formatPercent } from "@/lib/format";
import { MAX_POINTS } from "@/lib/live/metrics-store";
import { sparklineCeiling } from "@/lib/sparkline";
import { cn } from "@/lib/utils";
import type { MetricSample } from "@shared/types";

type MetricKey = "cpu" | "ram" | "disk";

const METRICS: Array<{ key: MetricKey; label: string; Icon: LucideIcon }> = [
  { key: "cpu", label: "CPU", Icon: Cpu },
  { key: "ram", label: "Memory", Icon: MemoryStick },
  { key: "disk", label: "Disk", Icon: HardDrive },
];

function toneFor(value: number | null) {
  if (value === null) return "text-muted-foreground";
  if (value >= 90) return "text-destructive";
  if (value >= 70) return "text-warning";
  return "text-brand";
}

function StatTile({
  label,
  Icon,
  history,
  value,
}: {
  label: string;
  Icon: LucideIcon;
  history: number[];
  value: number | null;
}) {
  const tone = toneFor(value);
  // The readout glides between samples; the label keeps the exact value for screen readers.
  const shown = useTweenedNumber(value);
  return (
    <div className="min-w-0 rounded-xl border bg-card px-3 pt-2.5 pb-2 shadow-xs sm:px-3.5">
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <div className="mt-1 flex items-end gap-3">
        <span
          className={cn(
            "shrink-0 font-mono text-lg leading-none font-semibold tabular-nums transition-colors sm:text-xl",
            tone
          )}
          aria-label={`${label} ${value === null ? "unavailable" : `${value.toFixed(1)} percent`}`}
        >
          {shown === null ? "–" : formatPercent(shown)}
          <span className="ml-px text-xs font-medium text-muted-foreground">%</span>
        </span>
        <Sparkline
          className={cn("hidden h-7 min-w-0 flex-1 sm:block", tone)}
          values={history}
          max={sparklineCeiling(history)}
          capacity={MAX_POINTS}
        />
      </div>
      <Sparkline
        className={cn("mt-2 h-6 w-full sm:hidden", tone)}
        values={history}
        max={sparklineCeiling(history)}
        capacity={MAX_POINTS}
      />
    </div>
  );
}

function ConnectionNote({ status, hasData }: { hasData: boolean; status: string }) {
  if (status === "connected" || (!hasData && status === "connecting")) return null;
  return (
    <p className="text-xs text-muted-foreground" role="status">
      {status === "offline" ? "Live stats paused. Showing the last values." : "Reconnecting…"}
    </p>
  );
}

/** Live host metrics as a compact row of tiles; the only component that subscribes to samples. */
/** Firing threshold alerts above the tiles; its own component so samples don't re-render it. */
// Alert wording and formatting load only once something is firing.
const AlertList = lazy(() =>
  import("@/components/stats/AlertList").then((module) => ({ default: module.AlertList }))
);

function StripAlerts() {
  const { active } = useAlerts();
  if (active.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <AlertList alerts={active} />
    </Suspense>
  );
}

export function StatsStrip() {
  const { samples, latest, status, error } = useMetrics();
  const history = (key: MetricKey) => samples.map((sample: MetricSample) => sample[key]);

  return (
    <section aria-label="Live stats" className="space-y-2">
      <StripAlerts />
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {METRICS.map(({ key, label, Icon }) => (
          <StatTile
            key={key}
            label={label}
            Icon={Icon}
            history={history(key)}
            value={latest ? latest[key] : null}
          />
        ))}
      </div>
      {error && samples.length === 0 ? (
        <p className="text-xs text-destructive" role="status">
          Live stats are unavailable: {error}
        </p>
      ) : (
        <ConnectionNote status={status} hasData={samples.length > 0} />
      )}
    </section>
  );
}
