import { describe, expect, it } from "bun:test";
import { metricHistorySchema } from "@shared/host-schemas";
import {
  bucketFromSnapshot,
  bucketStart,
  FIVE_MINUTES_MS,
  HISTORY_METRICS,
  historyReadings,
  isMinuteWritable,
  MAX_SAMPLE_WEIGHT_MS,
  mergeBuckets,
  MINUTE_MS,
  MINUTE_TIER,
  planHistoryRange,
  QUARTER_HOUR_MS,
  QUARTER_HOUR_TIER,
  regroupBuckets,
  retentionCutoff,
  roundMetric,
  toMetricHistory,
  type HistoryBucket,
} from "./rollup";
import { historySnapshot } from "./test-fixtures";

// 2026-10-10 12:00:00 UTC, on a quarter-hour boundary.
const T = Date.UTC(2026, 9, 10, 12, 0, 0);
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A bucket with only CPU readings. */
function cpuBucket(ts: number, avg: number, max = avg, weightMs = 60_000): HistoryBucket {
  return { ts, weightMs, stats: { cpu: { avg, max, weightMs } } };
}

describe("bucket boundaries", () => {
  it("puts a timestamp in the bucket that starts at or before it", () => {
    expect(bucketStart(T, MINUTE_MS)).toBe(T);
    expect(bucketStart(T + MINUTE_MS - 1, MINUTE_MS)).toBe(T);
    expect(bucketStart(T + MINUTE_MS, MINUTE_MS)).toBe(T + MINUTE_MS);
    expect(bucketStart(T + 14 * MINUTE_MS + 59_999, QUARTER_HOUR_MS)).toBe(T);
    expect(bucketStart(T + 7 * MINUTE_MS, FIVE_MINUTES_MS)).toBe(T + 5 * MINUTE_MS);
  });
});

describe("history readings", () => {
  it("keeps the strip's percentages, load, temperature and summed rates", () => {
    const snapshot = historySnapshot(T, { cpu: 12.5, memoryPercent: 40, load1: 0.75 });
    snapshot.network.push({ name: "wlan0", rxBytesPerSec: 24, txBytesPerSec: null });
    snapshot.disks.push({ name: "nvme0n1", readBytesPerSec: null, writeBytesPerSec: 8 });

    expect(historyReadings(snapshot, 61.2)).toEqual({
      cpu: 12.5,
      memory: 40,
      disk: 61.2,
      load1: 0.75,
      temperature: 50,
      netRx: 1024,
      netTx: 500,
      diskRead: 4096,
      diskWrite: 8200,
    });
  });

  it("reports null for anything the snapshot couldn't read", () => {
    const snapshot = historySnapshot(T, {
      cpu: null,
      memoryPercent: null,
      temperature: null,
      rates: { rx: null, tx: null },
    });
    snapshot.cpu.load = null;
    snapshot.disks = [];

    expect(historyReadings(snapshot, 10)).toEqual({
      cpu: null,
      memory: null,
      disk: 10,
      load1: null,
      temperature: null,
      netRx: null,
      netTx: null,
      diskRead: null,
      diskWrite: null,
    });
    snapshot.memory = { ...historySnapshot(T).memory!, totalBytes: 0 };
    expect(historyReadings(snapshot, 10).memory).toBeNull();
  });
});

describe("a snapshot as a bucket", () => {
  it("lands in its minute and weighs the time since the previous sample", () => {
    const bucket = bucketFromSnapshot(historySnapshot(T + 42_000, { intervalMs: 1_000 }), 30);

    expect(bucket.ts).toBe(T);
    expect(bucket.weightMs).toBe(1_000);
    expect(bucket.stats.cpu).toEqual({ avg: 20, max: 20, weightMs: 1_000 });
    expect(Object.keys(bucket.stats).sort()).toEqual([...HISTORY_METRICS].sort());
  });

  it("caps the weight after a stall and gives a first sample the idle weight", () => {
    expect(bucketFromSnapshot(historySnapshot(T, { intervalMs: 3_600_000 }), 1).weightMs).toBe(
      MAX_SAMPLE_WEIGHT_MS
    );
    expect(bucketFromSnapshot(historySnapshot(T, { intervalMs: null }), 1).weightMs).toBe(
      MAX_SAMPLE_WEIGHT_MS
    );
    expect(bucketFromSnapshot(historySnapshot(T, { intervalMs: 0 }), 1).weightMs).toBe(1);
  });

  it("leaves out readings that are missing or not finite", () => {
    const bucket = bucketFromSnapshot(historySnapshot(T, { temperature: null }), Number.NaN);
    expect(bucket.stats.temperature).toBeUndefined();
    expect(bucket.stats.disk).toBeUndefined();
    expect(bucket.stats.cpu).toBeDefined();
  });
});

describe("merging buckets", () => {
  it("averages by sampled time and keeps the highest peak", () => {
    // 1 second at 10% then 9 seconds at 40%: the time-weighted mean is 37%, not 25%.
    const merged = mergeBuckets(T, [cpuBucket(T, 10, 10, 1_000), cpuBucket(T, 40, 55, 9_000)]);
    expect(merged).toEqual({
      ts: T,
      weightMs: 10_000,
      stats: { cpu: { avg: 37, max: 55, weightMs: 10_000 } },
    });
  });

  it("averages each metric over the buckets that had it", () => {
    const withTemperature: HistoryBucket = {
      ts: T,
      weightMs: 60_000,
      stats: {
        cpu: { avg: 10, max: 10, weightMs: 60_000 },
        temperature: { avg: 60, max: 70, weightMs: 60_000 },
      },
    };
    const merged = mergeBuckets(T, [withTemperature, cpuBucket(T + MINUTE_MS, 30)]);

    expect(merged.weightMs).toBe(120_000);
    expect(merged.stats.cpu).toEqual({ avg: 20, max: 30, weightMs: 120_000 });
    expect(merged.stats.temperature).toEqual({ avg: 60, max: 70, weightMs: 60_000 });
    expect(merged.stats.memory).toBeUndefined();
  });

  it("gives the same result in any order and leaves its inputs alone", () => {
    const first = cpuBucket(T, 12, 20, 3_000);
    const second = cpuBucket(T, 18, 19, 7_000);
    const merged = mergeBuckets(T, [first, second]);

    expect(mergeBuckets(T, [second, first])).toEqual(merged);
    expect(first.stats.cpu).toEqual({ avg: 12, max: 20, weightMs: 3_000 });
    expect(mergeBuckets(T, [])).toEqual({ ts: T, weightMs: 0, stats: {} });
  });

  it("regroups finer buckets into coarser ones, oldest first", () => {
    const minutes = [7, 1, 0, 5].map((minute) => cpuBucket(T + minute * MINUTE_MS, minute));
    const groups = regroupBuckets(minutes, FIVE_MINUTES_MS);

    expect(groups.map((group) => group.ts)).toEqual([T, T + FIVE_MINUTES_MS]);
    expect(groups[0].stats.cpu).toEqual({ avg: 0.5, max: 1, weightMs: 120_000 });
    expect(groups[1].stats.cpu).toEqual({ avg: 6, max: 7, weightMs: 120_000 });
  });
});

describe("retention", () => {
  it("keeps 48 hours of minutes and 90 days of quarter hours", () => {
    expect(retentionCutoff(T + 30_000, MINUTE_TIER)).toBe(T - 48 * HOUR_MS);
    expect(retentionCutoff(T + 7 * MINUTE_MS, QUARTER_HOUR_TIER)).toBe(T - 90 * DAY_MS);
    // The bucket holding the cutoff instant is kept whole.
    expect(retentionCutoff(T + 20 * MINUTE_MS, QUARTER_HOUR_TIER)).toBe(
      T - 90 * DAY_MS + QUARTER_HOUR_MS
    );
  });

  it("refuses minutes whose quarter hour reaches past the minute rows still kept", () => {
    const now = T + 2 * DAY_MS + 5 * MINUTE_MS;
    expect(isMinuteWritable(now - MINUTE_MS, now)).toBe(true);
    // The minute cutoff is T + 5 min, so T + 5 min's quarter (starting at T) is no longer whole.
    expect(isMinuteWritable(T + 5 * MINUTE_MS, now)).toBe(false);
    expect(isMinuteWritable(T + QUARTER_HOUR_MS, now)).toBe(true);
  });
});

describe("range plans", () => {
  it("serves each range from the tier and resolution that keep the payload small", () => {
    const now = T + 30_000;
    const plans = (["1h", "24h", "7d", "30d"] as const).map((range) => {
      const plan = planHistoryRange(range, now);
      return {
        range,
        table: plan.tier.table,
        resolutionMs: plan.resolutionMs,
        buckets: (now - plan.from) / plan.resolutionMs,
        to: plan.to,
      };
    });

    expect(plans).toEqual([
      { range: "1h", table: "metric_history_1m", resolutionMs: MINUTE_MS, buckets: 59.5, to: now },
      {
        range: "24h",
        table: "metric_history_1m",
        resolutionMs: FIVE_MINUTES_MS,
        buckets: 287.1,
        to: now,
      },
      {
        range: "7d",
        table: "metric_history_15m",
        resolutionMs: QUARTER_HOUR_MS,
        buckets: 671 + 30_000 / QUARTER_HOUR_MS,
        to: now,
      },
      {
        range: "30d",
        table: "metric_history_15m",
        resolutionMs: QUARTER_HOUR_MS,
        buckets: 2879 + 30_000 / QUARTER_HOUR_MS,
        to: now,
      },
    ]);
  });

  it("ends the window with the bucket in progress", () => {
    const plan = planHistoryRange("1h", T + 30_000);
    expect(plan.from).toBe(T + MINUTE_MS - HOUR_MS);
    expect(bucketStart(plan.to, plan.resolutionMs)).toBe(T);
  });
});

describe("history response", () => {
  const window = planHistoryRange("1h", T + 30_000);

  it("returns index-aligned columns, rounded for display", () => {
    const bucket: HistoryBucket = {
      ts: T - MINUTE_MS,
      weightMs: 60_000,
      stats: {
        cpu: { avg: 12.345, max: 50.06, weightMs: 60_000 },
        load1: { avg: 0.4567, max: 1.2, weightMs: 60_000 },
        netRx: { avg: 1234.5, max: 2000.4, weightMs: 60_000 },
      },
    };
    const history = toMetricHistory(window, [bucket]);

    expect(metricHistorySchema.parse(history)).toEqual(history);
    expect(history).toMatchObject({
      range: "1h",
      resolutionMs: MINUTE_MS,
      from: window.from,
      to: window.to,
      ts: [T - MINUTE_MS],
    });
    expect(history.series.cpu).toEqual({ avg: [12.3], max: [50.1] });
    expect(history.series.load1).toEqual({ avg: [0.46], max: [1.2] });
    expect(history.series.netRx).toEqual({ avg: [1235], max: [2000] });
    expect(history.series.temperature).toEqual({ avg: [null], max: [null] });
    expect(roundMetric("diskWrite", 0.5)).toBe(1);
  });

  it("merges finer buckets into the resolution and drops the ones outside the window", () => {
    const history = toMetricHistory(window, [
      cpuBucket(window.from - MINUTE_MS, 99),
      cpuBucket(T, 10, 10, 5_000),
      cpuBucket(T, 20, 30, 5_000),
      cpuBucket(T + MINUTE_MS, 99),
    ]);

    expect(history.ts).toEqual([T]);
    expect(history.series.cpu).toEqual({ avg: [15], max: [30] });
  });

  it("breaks the line with one null entry where buckets are missing", () => {
    const history = toMetricHistory(window, [
      cpuBucket(T - 10 * MINUTE_MS, 1),
      cpuBucket(T - 9 * MINUTE_MS, 2),
      // Server down for six minutes.
      cpuBucket(T - 2 * MINUTE_MS, 3),
      cpuBucket(T, 4),
    ]);

    expect(history.ts).toEqual([
      T - 10 * MINUTE_MS,
      T - 9 * MINUTE_MS,
      T - 8 * MINUTE_MS,
      T - 2 * MINUTE_MS,
      T - MINUTE_MS,
      T,
    ]);
    expect(history.series.cpu.avg).toEqual([1, 2, null, 3, null, 4]);
    for (const metric of HISTORY_METRICS) {
      expect(history.series[metric].avg).toHaveLength(history.ts.length);
      expect(history.series[metric].max).toHaveLength(history.ts.length);
    }
  });

  it("is empty when nothing was recorded", () => {
    const history = toMetricHistory(planHistoryRange("30d", T), []);
    expect(history.ts).toEqual([]);
    expect(Object.keys(history.series)).toEqual(HISTORY_METRICS);
    expect(history.series.diskRead).toEqual({ avg: [], max: [] });
  });
});
