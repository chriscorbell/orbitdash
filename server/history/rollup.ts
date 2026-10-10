import type {
  HostSnapshot,
  MetricHistory,
  MetricHistoryMetric,
  MetricHistoryRange,
} from "@shared/types";

export const MINUTE_MS = 60_000;
export const FIVE_MINUTES_MS = 5 * MINUTE_MS;
export const QUARTER_HOUR_MS = 15 * MINUTE_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Decimals each metric is rounded to in responses. Stored values keep full precision so merging
 * buckets never compounds rounding. Being a Record, it also lists every metric exactly once.
 */
const RESPONSE_DECIMALS: Record<MetricHistoryMetric, number> = {
  cpu: 1,
  memory: 1,
  disk: 1,
  load1: 2,
  temperature: 1,
  netRx: 0,
  netTx: 0,
  diskRead: 0,
  diskWrite: 0,
};

export const HISTORY_METRICS = Object.keys(RESPONSE_DECIMALS) as MetricHistoryMetric[];

/** One metric over the samples in a bucket that had a reading for it. */
export interface MetricStat {
  avg: number; // weighted by each sample's weightMs
  max: number;
  weightMs: number;
}

/** Aggregated readings for one time bucket. */
export interface HistoryBucket {
  ts: number; // bucket start, ms since epoch
  weightMs: number; // sampled time the bucket covers
  stats: Partial<Record<MetricHistoryMetric, MetricStat>>; // a missing metric had no reading
}

/** A stored resolution: its table, bucket size, and how long its rows are kept. */
export interface HistoryTier {
  table: "metric_history_1m" | "metric_history_15m";
  bucketMs: number;
  retentionMs: number;
}

export const MINUTE_TIER: HistoryTier = {
  table: "metric_history_1m",
  bucketMs: MINUTE_MS,
  retentionMs: 48 * HOUR_MS,
};

export const QUARTER_HOUR_TIER: HistoryTier = {
  table: "metric_history_15m",
  bucketMs: QUARTER_HOUR_MS,
  retentionMs: 90 * DAY_MS,
};

export const HISTORY_TIERS = [MINUTE_TIER, QUARTER_HOUR_TIER] as const;

/**
 * A sample stands for the time since the previous one, capped at the idle cadence: after a stall
 * (a suspended host, a blocked event loop) its averages describe a long stretch, and letting it
 * outweigh a whole minute of normal samples would distort that minute.
 */
export const MAX_SAMPLE_WEIGHT_MS = 10_000;

/** Start of the `sizeMs` bucket holding `ts`. Buckets align to the epoch, so minutes are UTC. */
export function bucketStart(ts: number, sizeMs: number): number {
  return Math.floor(ts / sizeMs) * sizeMs;
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null;
}

/** The readings history keeps from one snapshot; null where the snapshot had none. */
export function historyReadings(
  snapshot: HostSnapshot,
  diskPercent: number
): Record<MetricHistoryMetric, number | null> {
  const { cpu, memory } = snapshot;
  return {
    cpu: cpu.usage,
    memory: memory && memory.totalBytes > 0 ? (memory.usedBytes / memory.totalBytes) * 100 : null,
    disk: diskPercent,
    load1: cpu.load?.one ?? null,
    temperature: cpu.temperatureCelsius,
    netRx: sumKnown(snapshot.network.map((entry) => entry.rxBytesPerSec)),
    netTx: sumKnown(snapshot.network.map((entry) => entry.txBytesPerSec)),
    diskRead: sumKnown(snapshot.disks.map((disk) => disk.readBytesPerSec)),
    diskWrite: sumKnown(snapshot.disks.map((disk) => disk.writeBytesPerSec)),
  };
}

/** One snapshot as a bucket of its own, in the minute it was taken. */
export function bucketFromSnapshot(snapshot: HostSnapshot, diskPercent: number): HistoryBucket {
  const weightMs = Math.min(
    MAX_SAMPLE_WEIGHT_MS,
    Math.max(1, snapshot.intervalMs ?? MAX_SAMPLE_WEIGHT_MS)
  );
  const stats: HistoryBucket["stats"] = {};
  const readings = historyReadings(snapshot, diskPercent);
  for (const metric of HISTORY_METRICS) {
    const value = readings[metric];
    if (value !== null && Number.isFinite(value)) {
      stats[metric] = { avg: value, max: value, weightMs };
    }
  }
  return { ts: bucketStart(snapshot.ts, MINUTE_MS), weightMs, stats };
}

/** Combines buckets into one starting at `ts`: time-weighted averages and the highest peak. */
export function mergeBuckets(ts: number, buckets: readonly HistoryBucket[]): HistoryBucket {
  const stats: HistoryBucket["stats"] = {};
  let weightMs = 0;
  for (const bucket of buckets) {
    weightMs += bucket.weightMs;
    for (const metric of HISTORY_METRICS) {
      const next = bucket.stats[metric];
      if (!next) continue;
      const current = stats[metric];
      if (!current) {
        stats[metric] = { ...next };
        continue;
      }
      const total = current.weightMs + next.weightMs;
      stats[metric] = {
        avg: (current.avg * current.weightMs + next.avg * next.weightMs) / total,
        max: Math.max(current.max, next.max),
        weightMs: total,
      };
    }
  }
  return { ts, weightMs, stats };
}

/** Regroups buckets into `sizeMs` buckets, merging the ones that land together; oldest first. */
export function regroupBuckets(buckets: readonly HistoryBucket[], sizeMs: number): HistoryBucket[] {
  const groups = new Map<number, HistoryBucket[]>();
  for (const bucket of buckets) {
    const start = bucketStart(bucket.ts, sizeMs);
    const group = groups.get(start);
    if (group) group.push(bucket);
    else groups.set(start, [bucket]);
  }
  return [...groups]
    .sort(([left], [right]) => left - right)
    .map(([start, group]) => mergeBuckets(start, group));
}

/** Start of the oldest bucket a tier keeps at `now`; rows that start earlier are pruned. */
export function retentionCutoff(now: number, tier: HistoryTier): number {
  return bucketStart(now - tier.retentionMs, tier.bucketMs);
}

/**
 * True when a finished minute can still be written. Each write rebuilds the minute's quarter hour
 * from its stored minutes, so a minute whose quarter reaches past the minute tier's retention
 * (only possible after the clock jumped back by days) would shrink that quarter; it is dropped.
 */
export function isMinuteWritable(minuteTs: number, now: number): boolean {
  return bucketStart(minuteTs, QUARTER_HOUR_MS) >= retentionCutoff(now, MINUTE_TIER);
}

interface RangePlan {
  tier: HistoryTier;
  resolutionMs: number;
  windowMs: number;
}

/**
 * 1h and 24h read minute rows (24h regrouped to 5 minutes, 288 points instead of 1440); 7d and
 * 30d read quarter-hour rows.
 */
const RANGE_PLANS: Record<MetricHistoryRange, RangePlan> = {
  "1h": { tier: MINUTE_TIER, resolutionMs: MINUTE_MS, windowMs: HOUR_MS },
  "24h": { tier: MINUTE_TIER, resolutionMs: FIVE_MINUTES_MS, windowMs: DAY_MS },
  "7d": { tier: QUARTER_HOUR_TIER, resolutionMs: QUARTER_HOUR_MS, windowMs: 7 * DAY_MS },
  "30d": { tier: QUARTER_HOUR_TIER, resolutionMs: QUARTER_HOUR_MS, windowMs: 30 * DAY_MS },
};

export interface HistoryWindow {
  range: MetricHistoryRange;
  tier: HistoryTier;
  resolutionMs: number;
  from: number; // start of the first bucket
  to: number; // now
}

/**
 * The tier and resolution that serve a range, and the buckets it covers at `now`: as many as fit
 * in the range, ending with the bucket in progress.
 */
export function planHistoryRange(range: MetricHistoryRange, now: number): HistoryWindow {
  const plan = RANGE_PLANS[range];
  const end = bucketStart(now, plan.resolutionMs) + plan.resolutionMs;
  return {
    range,
    tier: plan.tier,
    resolutionMs: plan.resolutionMs,
    from: end - plan.windowMs,
    to: now,
  };
}

export function roundMetric(metric: MetricHistoryMetric, value: number): number {
  const factor = 10 ** RESPONSE_DECIMALS[metric];
  return Math.round(value * factor) / factor;
}

/**
 * Builds the columnar response from buckets of any finer resolution. Buckets outside the window
 * are left out, and so are buckets without data; where buckets are missing between two points,
 * one all-null entry at the first missing bucket breaks the line instead of bridging the gap.
 */
export function toMetricHistory(
  window: HistoryWindow,
  buckets: readonly HistoryBucket[]
): MetricHistory {
  const ts: number[] = [];
  const series = Object.fromEntries(
    HISTORY_METRICS.map((metric) => [metric, { avg: [], max: [] }])
  ) as unknown as MetricHistory["series"];

  const push = (at: number, bucket: HistoryBucket | null) => {
    ts.push(at);
    for (const metric of HISTORY_METRICS) {
      const stat = bucket?.stats[metric];
      series[metric].avg.push(stat ? roundMetric(metric, stat.avg) : null);
      series[metric].max.push(stat ? roundMetric(metric, stat.max) : null);
    }
  };

  let previous: number | null = null;
  for (const bucket of regroupBuckets(buckets, window.resolutionMs)) {
    if (bucket.ts < window.from || bucket.ts > window.to) continue;
    if (previous !== null && bucket.ts - previous > window.resolutionMs) {
      push(previous + window.resolutionMs, null);
    }
    push(bucket.ts, bucket);
    previous = bucket.ts;
  }

  return {
    range: window.range,
    resolutionMs: window.resolutionMs,
    from: window.from,
    to: window.to,
    ts,
    series,
  };
}
