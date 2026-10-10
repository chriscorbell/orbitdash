export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const num = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};

/** 1234 -> "1,234", 123456 -> "123k", 1234567 -> "1.2M". */
export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 100_000) return `${Math.round(value / 1_000)}k`;
  return Math.round(value).toLocaleString("en-US");
}

export function formatPercent(value: number): string {
  return `${value >= 10 || value === 0 ? Math.round(value) : value.toFixed(1)}%`;
}

const RATE_UNITS = ["B/s", "KB/s", "MB/s", "GB/s"];

/** Bytes per second in decimal units, like download clients show them. */
export function formatRate(bytesPerSecond: number): string {
  let value = Math.max(0, bytesPerSecond);
  let unit = 0;
  while (value >= 1000 && unit < RATE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${RATE_UNITS[unit]}`;
}
