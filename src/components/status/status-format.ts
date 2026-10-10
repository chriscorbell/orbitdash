import { formatUptime } from "@/lib/format";
import type { ServiceStatus, ServiceStatusState } from "@shared/types";

export const STATUS_LABEL: Record<ServiceStatusState, string> = {
  up: "Up",
  degraded: "Slow",
  down: "Down",
  unknown: "Not checked yet",
};

/** "42 ms", or "1.2 s" from a second up. */
export function formatLatency(ms: number): string {
  return ms < 1_000 ? `${Math.round(ms)} ms` : `${(ms / 1_000).toFixed(1)} s`;
}

/** "99.93%", and plain "100%" or "0%" for whole numbers. */
export function formatUptimePercent(percent: number): string {
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2)}%`;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** A clock time today, or a date and time before that. */
export function formatClock(ts: number, now: number): string {
  return new Date(ts).toDateString() === new Date(now).toDateString()
    ? timeFormat.format(ts)
    : dateTimeFormat.format(ts);
}

/** "Up for 3h 12m" or "Down since 14:02"; null before the first check. */
export function describeSince(status: ServiceStatus, now: number): string | null {
  if (status.state === "unknown" || status.changedAt === null) return null;
  if (status.state === "down") return `Down since ${formatClock(status.changedAt, now)}`;

  const seconds = (now - status.changedAt) / 1_000;
  return seconds < 60 ? "Up for under a minute" : `Up for ${formatUptime(seconds)}`;
}

/** Why the last check failed: the outage itself, or a single miss not yet counted as one. */
export function describeProblem(status: ServiceStatus): string | null {
  if (!status.error || status.state === "unknown") return null;
  return status.state === "down" ? status.error : `Last check failed: ${status.error}`;
}
