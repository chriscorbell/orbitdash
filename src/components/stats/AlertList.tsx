import { describeAlert, formatAlertValue } from "@shared/alerts";
import type { MetricAlert } from "@shared/types";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Firing alerts as slim rows; red once a value is well past its threshold, amber before. */
export function AlertList({ alerts, className }: { alerts: MetricAlert[]; className?: string }) {
  if (alerts.length === 0) return null;
  return (
    <ul aria-label="Active alerts" className={cn("space-y-1.5", className)}>
      {alerts.map((alert) => {
        const severe = alert.value >= alert.threshold + (alert.metric === "temperature" ? 10 : 5);
        return (
          <li
            key={alert.id}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm animate-in fade-in-0 slide-in-from-top-1 duration-300 motion-reduce:animate-none",
              severe ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10"
            )}
          >
            <TriangleAlert
              aria-hidden="true"
              className={cn("h-4 w-4 shrink-0", severe ? "text-destructive" : "text-warning")}
            />
            <span className="min-w-0 flex-1 truncate">{describeAlert(alert)}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              now {formatAlertValue(alert.metric, alert.value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
