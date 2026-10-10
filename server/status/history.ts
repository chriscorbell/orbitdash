import type { StatusHistory, StatusHistoryBucket, StatusHistoryRange } from "@shared/types";
import { isSlow } from "./state";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Raw check results are kept this long: enough for the 24h view's 48 half hours. */
export const STATUS_RESULTS_RETENTION_MS = DAY_MS;
/** Hourly totals are kept this long: enough for the 30d view's 30 days. */
export const STATUS_HOURLY_RETENTION_MS = 30 * DAY_MS;

export interface StatusHistoryPlan {
  range: StatusHistoryRange;
  source: "results" | "hourly";
  bucketMs: number;
  count: number;
  from: number; // start of the first bucket
}

/**
 * Buckets for a range. 24h is 48 half hours from raw results, the last one holding now. 30d is 30
 * days from hourly totals, each 24 hours long and ending with the current hour, so no day is split
 * at a UTC midnight that means nothing to the viewer.
 */
export function planStatusHistory(range: StatusHistoryRange, now: number): StatusHistoryPlan {
  if (range === "24h") {
    const bucketMs = 30 * MINUTE_MS;
    const count = 48;
    const last = Math.floor(now / bucketMs) * bucketMs;
    return { range, source: "results", bucketMs, count, from: last - (count - 1) * bucketMs };
  }

  const count = 30;
  const end = Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS;
  return { range, source: "hourly", bucketMs: DAY_MS, count, from: end - count * DAY_MS };
}

export interface ResultRow {
  ts: number;
  ok: number;
  latency_ms: number | null;
}

export interface HourlyRow {
  ts: number;
  checks: number;
  failures: number;
  slow: number;
  latency_sum_ms: number;
}

interface Tally {
  checks: number;
  failures: number;
  slow: number;
  latencySum: number;
}

function tallyInto(
  plan: StatusHistoryPlan,
  rows: readonly { ts: number }[],
  add: (tally: Tally, index: number) => void
): Tally[] {
  const tallies = Array.from({ length: plan.count }, () => ({
    checks: 0,
    failures: 0,
    slow: 0,
    latencySum: 0,
  }));
  rows.forEach((row, index) => {
    const bucket = Math.floor((row.ts - plan.from) / plan.bucketMs);
    if (bucket >= 0 && bucket < plan.count) add(tallies[bucket], index);
  });
  return tallies;
}

function toBuckets(plan: StatusHistoryPlan, tallies: Tally[]): StatusHistoryBucket[] {
  return tallies.map((tally, index) => {
    const passed = tally.checks - tally.failures;
    return {
      ts: plan.from + index * plan.bucketMs,
      checks: tally.checks,
      failures: tally.failures,
      slow: tally.slow,
      latencyMs: passed > 0 ? Math.round(tally.latencySum / passed) : null,
    };
  });
}

export function bucketResults(
  plan: StatusHistoryPlan,
  rows: readonly ResultRow[]
): StatusHistoryBucket[] {
  return toBuckets(
    plan,
    tallyInto(plan, rows, (tally, index) => {
      const row = rows[index];
      const ok = row.ok === 1;
      tally.checks += 1;
      if (!ok) {
        tally.failures += 1;
        return;
      }
      tally.latencySum += row.latency_ms ?? 0;
      if (isSlow({ ok, latencyMs: row.latency_ms })) tally.slow += 1;
    })
  );
}

export function bucketHourly(
  plan: StatusHistoryPlan,
  rows: readonly HourlyRow[]
): StatusHistoryBucket[] {
  return toBuckets(
    plan,
    tallyInto(plan, rows, (tally, index) => {
      const row = rows[index];
      tally.checks += row.checks;
      tally.failures += row.failures;
      tally.slow += row.slow;
      tally.latencySum += row.latency_sum_ms;
    })
  );
}

/** Uptime in percent, rounded down to two decimals so one failure never reads as 100%. */
export function uptimePercent(checks: number, failures: number): number | null {
  if (checks === 0) return null;
  return Math.floor(((checks - failures) / checks) * 10_000) / 100;
}

export function buildStatusHistory(
  id: string,
  plan: StatusHistoryPlan,
  buckets: StatusHistoryBucket[],
  now: number
): StatusHistory {
  const checks = buckets.reduce((sum, bucket) => sum + bucket.checks, 0);
  const failures = buckets.reduce((sum, bucket) => sum + bucket.failures, 0);
  return {
    id,
    range: plan.range,
    resolutionMs: plan.bucketMs,
    from: plan.from,
    to: now,
    uptime: uptimePercent(checks, failures),
    buckets,
  };
}
