import type { CpuTimes } from "./procfs";

/** Rounds to two decimals, the precision MetricSample percentages have always used. */
export function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Busy share of the CPU time that passed between two readings, as a percentage. Null without a
 * previous reading, or when the counters didn't advance or went backwards (a core came back
 * online, or a reading came from somewhere else).
 */
export function cpuPercent(current: CpuTimes, previous: CpuTimes | undefined): number | null {
  if (!previous) return null;
  const total = current.total - previous.total;
  if (total <= 0) return null;
  // iowait can step backwards on tickless kernels, so keep idle inside the elapsed total.
  const idle = Math.min(total, Math.max(0, current.idle - previous.idle));
  return roundPercent(((total - idle) / total) * 100);
}

/**
 * Average per-second increase of a cumulative counter, rounded to a whole unit. Null without a
 * previous value, without elapsed time, or when the counter went backwards (an interface or disk
 * was re-created, or a 32-bit counter wrapped).
 */
export function perSecond(
  current: number,
  previous: number | undefined,
  elapsedMs: number | null
): number | null {
  if (previous === undefined || elapsedMs === null || elapsedMs <= 0 || current < previous) {
    return null;
  }
  return Math.round(((current - previous) * 1000) / elapsedMs);
}
