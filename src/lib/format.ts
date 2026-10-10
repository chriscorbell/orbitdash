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
