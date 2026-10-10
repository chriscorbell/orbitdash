import { CHECK_INTERVAL_PRESETS_S } from "@shared/status";

/** "15 sec", "5 min", "1 hour". */
export function formatCheckInterval(seconds: number): string {
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} sec`;
}

/** The preset intervals, plus the current one if it was set some other way (the API). */
export function checkIntervalOptions(current: number): number[] {
  const presets: readonly number[] = CHECK_INTERVAL_PRESETS_S;
  return presets.includes(current)
    ? [...presets]
    : [...presets, current].sort((left, right) => left - right);
}
