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

const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];

/** Bytes in binary units with about three significant digits: "512 B", "1.5 GiB", "120 GiB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const exponent = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`;
}

/** A transfer rate, e.g. "3.20 MiB/s". */
export function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}
