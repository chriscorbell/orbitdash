import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getDb } from "../db";
import { stopCollection, tickCollection } from "../metrics";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";
import {
  createMetricHistoryRecorder,
  FLUSH_DELAY_MS,
  MAX_PENDING_MINUTES,
  metricHistory,
  nextFlushDelayMs,
} from "./recorder";
import { bucketStart, MINUTE_MS, MINUTE_TIER, QUARTER_HOUR_MS, QUARTER_HOUR_TIER } from "./rollup";
import { readBuckets } from "./store";
import { historySnapshot, type SnapshotReadings } from "./test-fixtures";

// 2026-10-10 12:00:00 UTC, on a quarter-hour boundary.
const T = Date.UTC(2026, 9, 10, 12, 0, 0);
const DAY_MS = 24 * 60 * MINUTE_MS;

let dataDir: string;

beforeEach(() => {
  dataDir = setupTestDatabase("orbitdash-history-");
});

afterEach(() => {
  stopCollection();
  cleanupTestDatabase(dataDir);
});

type Recorder = ReturnType<typeof createMetricHistoryRecorder>;

/** Records one idle-cadence sample (10 seconds apart) per offset, in seconds from `start`. */
function recordEvery10s(
  recorder: Recorder,
  start: number,
  seconds: number[],
  readings: SnapshotReadings = {}
) {
  for (const second of seconds) {
    recorder.record(historySnapshot(start + second * 1000, readings), 40);
  }
}

function storedRow(table: string, ts: number) {
  return getDb()
    .prepare(`SELECT ts, weight_ms, cpu_avg, cpu_max FROM ${table} WHERE ts = ?`)
    .get(ts);
}

describe("flushing minutes", () => {
  it("writes each finished minute once and keeps the minute in progress in memory", () => {
    const recorder = createMetricHistoryRecorder(getDb);
    recordEvery10s(recorder, T, [0, 10, 20], { cpu: 10 });
    recordEvery10s(recorder, T, [30, 40, 50], { cpu: 40 });
    recordEvery10s(recorder, T + MINUTE_MS, [0], { cpu: 90 });

    expect(recorder.flush(T + MINUTE_MS - 1)).toBe(0);
    expect(recorder.flush(T + MINUTE_MS + FLUSH_DELAY_MS)).toBe(1);
    expect(recorder.flush(T + MINUTE_MS + FLUSH_DELAY_MS)).toBe(0);

    const minute = { ts: T, weight_ms: 60_000, cpu_avg: 25, cpu_max: 40 };
    expect(storedRow(MINUTE_TIER.table, T)).toEqual(minute);
    expect(storedRow(QUARTER_HOUR_TIER.table, T)).toEqual(minute);
    expect(storedRow(MINUTE_TIER.table, T + MINUTE_MS)).toBeNull();

    // The unwritten minute is still served.
    const history = recorder.read("1h", T + MINUTE_MS + 5_000);
    expect(history.ts).toEqual([T, T + MINUTE_MS]);
    expect(history.series.cpu.avg).toEqual([25, 90]);
  });

  it("merges the rest of a minute into what was written before a restart", () => {
    const before = createMetricHistoryRecorder(getDb);
    recordEvery10s(before, T, [0, 10, 20], { cpu: 10 });
    expect(before.flush(T + 25_000, { includePartial: true })).toBe(1);
    expect(storedRow(MINUTE_TIER.table, T)).toEqual({
      ts: T,
      weight_ms: 30_000,
      cpu_avg: 10,
      cpu_max: 10,
    });

    const after = createMetricHistoryRecorder(getDb);
    recordEvery10s(after, T, [40, 50], { cpu: 40 });
    expect(after.flush(T + MINUTE_MS + FLUSH_DELAY_MS)).toBe(1);

    const merged = { ts: T, weight_ms: 50_000, cpu_avg: 22, cpu_max: 40 };
    expect(storedRow(MINUTE_TIER.table, T)).toEqual(merged);
    expect(storedRow(QUARTER_HOUR_TIER.table, T)).toEqual(merged);
  });

  it("rebuilds the quarter hour from all of its stored minutes", () => {
    const recorder = createMetricHistoryRecorder(getDb);
    for (const [minute, cpu] of [
      [0, 10],
      [1, 20],
      [2, 60],
    ]) {
      recordEvery10s(recorder, T + minute * MINUTE_MS, [0, 10, 20, 30, 40, 50], { cpu });
      recorder.flush(T + (minute + 1) * MINUTE_MS + FLUSH_DELAY_MS);
    }
    recordEvery10s(recorder, T + QUARTER_HOUR_MS, [0, 10, 20, 30, 40, 50], { cpu: 5 });
    recorder.flush(T + QUARTER_HOUR_MS + MINUTE_MS + FLUSH_DELAY_MS);

    expect(storedRow(QUARTER_HOUR_TIER.table, T)).toEqual({
      ts: T,
      weight_ms: 180_000,
      cpu_avg: 30,
      cpu_max: 60,
    });
    expect(storedRow(QUARTER_HOUR_TIER.table, T + QUARTER_HOUR_MS)).toMatchObject({ cpu_avg: 5 });
  });

  it("keeps minutes in memory when the write fails, and writes them next time", () => {
    let failing = true;
    const recorder = createMetricHistoryRecorder(() => {
      if (failing) throw new Error("disk I/O error");
      return getDb();
    });
    recordEvery10s(recorder, T, [0, 10]);

    expect(() => recorder.flush(T + MINUTE_MS + FLUSH_DELAY_MS)).toThrow("disk I/O error");
    failing = false;
    expect(recorder.flush(T + 2 * MINUTE_MS + FLUSH_DELAY_MS)).toBe(1);
    expect(storedRow(MINUTE_TIER.table, T)).toMatchObject({ weight_ms: 20_000 });
  });

  it("drops the oldest minute once too many are waiting", () => {
    const recorder = createMetricHistoryRecorder(getDb);
    for (let minute = 0; minute <= MAX_PENDING_MINUTES; minute++) {
      recordEvery10s(recorder, T + minute * MINUTE_MS, [0]);
    }

    expect(recorder.flush(T + DAY_MS)).toBe(MAX_PENDING_MINUTES);
    expect(storedRow(MINUTE_TIER.table, T)).toBeNull();
    expect(storedRow(MINUTE_TIER.table, T + MINUTE_MS)).not.toBeNull();
  });

  it("discards minutes older than the minute rows it keeps", () => {
    const recorder = createMetricHistoryRecorder(getDb);
    recordEvery10s(recorder, T - 3 * DAY_MS, [0]);

    expect(recorder.flush(T)).toBe(0);
    expect(readBuckets(getDb(), MINUTE_TIER, 0, T)).toEqual([]);
    expect(recorder.read("30d", T).ts).toEqual([]);
  });
});

describe("reading history", () => {
  it("regroups minutes into five-minute points for 24h", () => {
    const recorder = createMetricHistoryRecorder(getDb);
    for (const minute of [0, 1, 2, 3, 4, 5]) {
      recordEvery10s(recorder, T + minute * MINUTE_MS, [0, 30], { cpu: minute * 10 });
    }
    recorder.flush(T + 5 * MINUTE_MS + FLUSH_DELAY_MS);

    const history = recorder.read("24h", T + 5 * MINUTE_MS + 30_000);
    expect(history.resolutionMs).toBe(5 * MINUTE_MS);
    expect(history.ts).toEqual([T, T + 5 * MINUTE_MS]);
    expect(history.series.cpu).toEqual({ avg: [20, 50], max: [40, 50] });
  });

  it("serves 7d and 30d from quarter hours, with unwritten minutes merged in", () => {
    const recorder = createMetricHistoryRecorder(getDb);
    recordEvery10s(recorder, T - QUARTER_HOUR_MS, [0, 10, 20, 30, 40, 50], { cpu: 8 });
    recordEvery10s(recorder, T, [0, 10, 20, 30, 40, 50], { cpu: 10 });
    recorder.flush(T + MINUTE_MS + FLUSH_DELAY_MS);
    recordEvery10s(recorder, T + MINUTE_MS, [0, 10, 20, 30, 40, 50], { cpu: 30 });

    const now = T + 2 * MINUTE_MS;
    for (const range of ["7d", "30d"] as const) {
      const history = recorder.read(range, now);
      expect(history.resolutionMs).toBe(QUARTER_HOUR_MS);
      expect(history.ts).toEqual([T - QUARTER_HOUR_MS, T]);
      expect(history.series.cpu.avg).toEqual([8, 20]);
    }
  });

  it("includes what the collector samples", () => {
    stopCollection();
    const sample = tickCollection(Date.now() + 9_000_000);
    const now = Date.now();
    const history = metricHistory.read("1h", now);

    expect(sample).not.toBeNull();
    expect(history.ts.at(-1)).toBe(bucketStart(now, MINUTE_MS));
    expect(history.series.disk.max.at(-1)).not.toBeNull();
  });
});

describe("pruning", () => {
  it("deletes minute rows after 48 hours and quarter hours after 90 days", () => {
    const recorder = createMetricHistoryRecorder(getDb);
    const now = T;
    const minuteCutoff = T - 2 * DAY_MS;
    const quarterCutoff = T - 90 * DAY_MS;
    const insert = (table: string, ts: number) =>
      getDb().prepare(`INSERT INTO ${table} (ts, weight_ms) VALUES (?, 1)`).run(ts);
    insert(MINUTE_TIER.table, minuteCutoff - MINUTE_MS);
    insert(MINUTE_TIER.table, minuteCutoff);
    insert(QUARTER_HOUR_TIER.table, quarterCutoff - QUARTER_HOUR_MS);
    insert(QUARTER_HOUR_TIER.table, quarterCutoff);

    expect(recorder.prune(now)).toBe(2);
    expect(readBuckets(getDb(), MINUTE_TIER, 0, now).map((bucket) => bucket.ts)).toEqual([
      minuteCutoff,
    ]);
    expect(readBuckets(getDb(), QUARTER_HOUR_TIER, 0, now).map((bucket) => bucket.ts)).toEqual([
      quarterCutoff,
    ]);
    expect(recorder.prune(now)).toBe(0);
  });
});

describe("flush schedule", () => {
  it("flushes just after each minute ends", () => {
    expect(nextFlushDelayMs(T)).toBe(MINUTE_MS + FLUSH_DELAY_MS);
    expect(nextFlushDelayMs(T + 59_000)).toBe(1_000 + FLUSH_DELAY_MS);
  });
});
