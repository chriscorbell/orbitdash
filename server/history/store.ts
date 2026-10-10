import type { Database } from "bun:sqlite";
import type { MetricHistoryMetric } from "@shared/types";
import {
  bucketStart,
  HISTORY_METRICS,
  HISTORY_TIERS,
  isMinuteWritable,
  mergeBuckets,
  MINUTE_TIER,
  QUARTER_HOUR_MS,
  QUARTER_HOUR_TIER,
  retentionCutoff,
  type HistoryBucket,
  type HistoryTier,
} from "./rollup";

/** Column prefix of each metric in the history tables (migration 7). */
const COLUMN_PREFIX: Record<MetricHistoryMetric, string> = {
  cpu: "cpu",
  memory: "mem",
  disk: "disk",
  load1: "load1",
  temperature: "temp",
  netRx: "net_rx",
  netTx: "net_tx",
  diskRead: "disk_read",
  diskWrite: "disk_write",
};

const VALUE_COLUMNS = HISTORY_METRICS.flatMap((metric) => [
  `${COLUMN_PREFIX[metric]}_avg`,
  `${COLUMN_PREFIX[metric]}_max`,
]);
const COLUMNS = ["ts", "weight_ms", ...VALUE_COLUMNS].join(", ");

type HistoryRow = Record<string, number | null>;

function fromRow(row: HistoryRow): HistoryBucket {
  const weightMs = row.weight_ms!;
  const stats: HistoryBucket["stats"] = {};
  for (const metric of HISTORY_METRICS) {
    const avg = row[`${COLUMN_PREFIX[metric]}_avg`];
    const max = row[`${COLUMN_PREFIX[metric]}_max`];
    if (avg !== null && max !== null) {
      stats[metric] = { avg, max, weightMs };
    }
  }
  return { ts: row.ts!, weightMs, stats };
}

function toRowValues(bucket: HistoryBucket): Array<number | null> {
  return [
    bucket.ts,
    bucket.weightMs,
    ...HISTORY_METRICS.flatMap((metric) => {
      const stat = bucket.stats[metric];
      return stat ? [stat.avg, stat.max] : [null, null];
    }),
  ];
}

/** Stored buckets of a tier that start within [from, to], oldest first. */
export function readBuckets(
  db: Database,
  tier: HistoryTier,
  from: number,
  to: number
): HistoryBucket[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM ${tier.table} WHERE ts >= ? AND ts <= ? ORDER BY ts ASC`)
    .all(from, to) as HistoryRow[];
  return rows.map(fromRow);
}

function upsertBucket(db: Database, tier: HistoryTier, bucket: HistoryBucket): void {
  const placeholders = ["?", "?", ...VALUE_COLUMNS.map(() => "?")].join(", ");
  const updates = ["weight_ms", ...VALUE_COLUMNS]
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
  db.prepare(
    `INSERT INTO ${tier.table} (${COLUMNS}) VALUES (${placeholders})
     ON CONFLICT(ts) DO UPDATE SET ${updates}`
  ).run(...toRowValues(bucket));
}

/**
 * Writes finished minute buckets in one transaction and returns how many it wrote. A minute that
 * already has a row (part of it was written before a restart) is merged into it, and each quarter
 * hour the minutes fall in is rebuilt from its stored minutes, so rewriting it is idempotent.
 */
export function writeMinuteBuckets(
  db: Database,
  buckets: readonly HistoryBucket[],
  now: number
): number {
  const writable = buckets.filter((bucket) => isMinuteWritable(bucket.ts, now));
  if (writable.length === 0) return 0;

  db.transaction(() => {
    const quarters = new Set<number>();
    for (const bucket of writable) {
      const [stored] = readBuckets(db, MINUTE_TIER, bucket.ts, bucket.ts);
      upsertBucket(db, MINUTE_TIER, stored ? mergeBuckets(bucket.ts, [stored, bucket]) : bucket);
      quarters.add(bucketStart(bucket.ts, QUARTER_HOUR_MS));
    }
    for (const quarter of quarters) {
      const minutes = readBuckets(db, MINUTE_TIER, quarter, quarter + QUARTER_HOUR_MS - 1);
      upsertBucket(db, QUARTER_HOUR_TIER, mergeBuckets(quarter, minutes));
    }
  })();

  return writable.length;
}

/** Deletes rows past each tier's retention and returns how many went. */
export function pruneHistory(db: Database, now: number): number {
  return db.transaction(() =>
    HISTORY_TIERS.reduce(
      (removed, tier) =>
        removed +
        db.prepare(`DELETE FROM ${tier.table} WHERE ts < ?`).run(retentionCutoff(now, tier))
          .changes,
      0
    )
  )();
}
