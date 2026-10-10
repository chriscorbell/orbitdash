import type { Database } from "bun:sqlite";
import type { HostSnapshot, MetricHistory, MetricHistoryRange } from "@shared/types";
import { getDb } from "../db";
import {
  bucketFromSnapshot,
  mergeBuckets,
  MINUTE_MS,
  planHistoryRange,
  toMetricHistory,
  type HistoryBucket,
} from "./rollup";
import { pruneHistory, readBuckets, writeMinuteBuckets } from "./store";

/**
 * Minutes kept in memory while writes keep failing (a full or read-only disk). Past this the
 * oldest is dropped, so a broken database can't grow memory without bound.
 */
export const MAX_PENDING_MINUTES = 60;

/** How long after a minute ends the flush job writes it, so that minute's last sample is in. */
export const FLUSH_DELAY_MS = 2_000;

export interface MetricHistoryRecorder {
  /** Adds one snapshot to the minute it was taken in. */
  record: (snapshot: HostSnapshot, diskPercent: number) => void;
  /**
   * Writes every finished minute in one transaction, and with `includePartial` the minute in
   * progress too (at shutdown). Returns how many minutes were written. On failure the minutes
   * stay in memory for the next flush.
   */
  flush: (now: number, options?: { includePartial?: boolean }) => number;
  /** A range's history: stored rows plus the minutes not written yet. */
  read: (range: MetricHistoryRange, now: number) => MetricHistory;
  /** Deletes rows past each tier's retention; returns how many went. */
  prune: (now: number) => number;
}

/** Collects snapshots into minute buckets in memory and writes them to SQLite once a minute. */
export function createMetricHistoryRecorder(getDatabase: () => Database): MetricHistoryRecorder {
  const pending = new Map<number, HistoryBucket>();

  return {
    record(snapshot, diskPercent) {
      const sample = bucketFromSnapshot(snapshot, diskPercent);
      const current = pending.get(sample.ts);
      pending.set(sample.ts, current ? mergeBuckets(sample.ts, [current, sample]) : sample);
      if (pending.size > MAX_PENDING_MINUTES) {
        pending.delete(Math.min(...pending.keys()));
      }
    },

    flush(now, { includePartial = false } = {}) {
      const due = [...pending.values()].filter(
        (bucket) => includePartial || bucket.ts + MINUTE_MS <= now
      );
      if (due.length === 0) return 0;

      const written = writeMinuteBuckets(getDatabase(), due, now);
      // Only after the transaction committed, so a failed write is retried and a minute is never
      // merged into its row twice.
      for (const bucket of due) pending.delete(bucket.ts);
      return written;
    },

    read(range, now) {
      const window = planHistoryRange(range, now);
      const stored = readBuckets(getDatabase(), window.tier, window.from, now);
      return toMetricHistory(window, [...stored, ...pending.values()]);
    },

    prune(now) {
      return pruneHistory(getDatabase(), now);
    },
  };
}

/** Delay from `now` until the flush just after the next minute boundary. */
export function nextFlushDelayMs(now: number): number {
  return MINUTE_MS - (now % MINUTE_MS) + FLUSH_DELAY_MS;
}

/** The server's recorder: metrics.ts feeds it, the jobs flush and prune it, the route reads it. */
export const metricHistory = createMetricHistoryRecorder(getDb);
