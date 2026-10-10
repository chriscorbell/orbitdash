const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 hours ago", "in 2 days", or "just now" for anything under a minute. */
export function formatRelativeAge(isoDate: string, now: number = Date.now()): string {
  const elapsed = Date.parse(isoDate) - now;
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) {
      return relativeTime.format(Math.round(elapsed / size), unit);
    }
  }
  return "just now";
}

/** "14d 3h", "5h 12m", "8m" — the two largest units, for uptimes. */
export function formatUptime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** One decimal under 10%, whole numbers above, so values don't jitter in width. */
export function formatPercent(value: number): string {
  return value < 10 ? value.toFixed(1) : Math.round(value).toString();
}
