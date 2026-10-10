import { AlertList } from "@/components/stats/AlertList";
import { useAlerts } from "@/hooks/useAlerts";
import { describeAlert, formatAlertValue } from "@shared/alerts";
import { BellRing } from "lucide-react";

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatSpan(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

/** Firing alerts and the last few that resolved, for the Stats page. */
export function AlertsCard() {
  const { active, recent } = useAlerts();
  if (active.length === 0 && recent.length === 0) return null;

  return (
    <section aria-label="Alerts" className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <BellRing aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        Alerts
      </h2>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is firing right now.</p>
      ) : (
        <AlertList alerts={active} />
      )}
      {recent.length > 0 && (
        <ul aria-label="Recent alerts" className="divide-y divide-border text-sm">
          {recent.slice(0, 6).map((alert) => (
            <li key={alert.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-muted-foreground">{describeAlert(alert)}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {timeFormat.format(alert.firedAt)} ·{" "}
                {formatSpan((alert.resolvedAt ?? 0) - alert.startedAt)} · peak{" "}
                {formatAlertValue(alert.metric, alert.peak)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
