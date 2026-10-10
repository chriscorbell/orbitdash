import type { Database } from "bun:sqlite";
import type { ServiceStatusState, StatusCheckMethod } from "@shared/types";
import {
  STATUS_HOURLY_RETENTION_MS,
  STATUS_RESULTS_RETENTION_MS,
  type HourlyRow,
  type ResultRow,
} from "./history";
import { isSlow, type CheckResult, type StoredStatus } from "./state";

const HOUR_MS = 60 * 60 * 1000;

/** A service with checks turned on, as the monitor needs it. */
export interface CheckRow {
  id: string;
  url: string;
  check_method: StatusCheckMethod;
  check_target: string | null;
  check_interval: number;
  check_ignore_tls: number;
}

interface StatusRow {
  service_id: string;
  target_key: string;
  state: ServiceStatusState;
  failures: number;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
  checked_at: number | null;
  changed_at: number | null;
}

function fromStatusRow(row: StatusRow): StoredStatus {
  return {
    serviceId: row.service_id,
    targetKey: row.target_key,
    state: row.state,
    failures: row.failures,
    latencyMs: row.latency_ms,
    statusCode: row.status_code,
    error: row.error,
    checkedAt: row.checked_at,
    changedAt: row.changed_at,
  };
}

export function readEnabledChecks(db: Database): CheckRow[] {
  return db
    .prepare(
      `SELECT id, url, check_method, check_target, check_interval, check_ignore_tls
       FROM services WHERE check_enabled = 1`
    )
    .all() as CheckRow[];
}

export function serviceExists(db: Database, id: string): boolean {
  return db.prepare("SELECT 1 FROM services WHERE id = ?").get(id) !== null;
}

export function readStoredStatuses(db: Database): StoredStatus[] {
  return (db.prepare("SELECT * FROM service_status").all() as StatusRow[]).map(fromStatusRow);
}

export function writeStatus(db: Database, status: StoredStatus): void {
  db.prepare(
    `INSERT INTO service_status
       (service_id, target_key, state, failures, latency_ms, status_code, error, checked_at, changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(service_id) DO UPDATE SET
       target_key = excluded.target_key, state = excluded.state, failures = excluded.failures,
       latency_ms = excluded.latency_ms, status_code = excluded.status_code, error = excluded.error,
       checked_at = excluded.checked_at, changed_at = excluded.changed_at`
  ).run(
    status.serviceId,
    status.targetKey,
    status.state,
    status.failures,
    status.latencyMs,
    status.statusCode,
    status.error,
    status.checkedAt,
    status.changedAt
  );
}

export function deleteStatus(db: Database, id: string): void {
  db.prepare("DELETE FROM service_status WHERE service_id = ?").run(id);
}

/**
 * Stores one check in a single transaction: the raw result, its hour's totals, and the status it
 * led to. A result already stored for that millisecond is not counted again.
 */
export function recordCheckResult(
  db: Database,
  status: StoredStatus,
  result: CheckResult,
  ts: number
): void {
  db.transaction(() => {
    const inserted = db
      .prepare(
        "INSERT OR IGNORE INTO status_results (service_id, ts, ok, latency_ms) VALUES (?, ?, ?, ?)"
      )
      .run(status.serviceId, ts, result.ok ? 1 : 0, result.ok ? result.latencyMs : null);

    if (inserted.changes > 0) {
      db.prepare(
        `INSERT INTO status_hourly (service_id, ts, checks, failures, slow, latency_sum_ms)
         VALUES (?, ?, 1, ?, ?, ?)
         ON CONFLICT(service_id, ts) DO UPDATE SET
           checks = checks + 1,
           failures = failures + excluded.failures,
           slow = slow + excluded.slow,
           latency_sum_ms = latency_sum_ms + excluded.latency_sum_ms`
      ).run(
        status.serviceId,
        Math.floor(ts / HOUR_MS) * HOUR_MS,
        result.ok ? 0 : 1,
        isSlow(result) ? 1 : 0,
        result.ok ? (result.latencyMs ?? 0) : 0
      );
    }

    writeStatus(db, status);
  })();
}

export function readResults(db: Database, id: string, from: number, to: number): ResultRow[] {
  return db
    .prepare(
      `SELECT ts, ok, latency_ms FROM status_results
       WHERE service_id = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC`
    )
    .all(id, from, to) as ResultRow[];
}

export function readHourly(db: Database, id: string, from: number, to: number): HourlyRow[] {
  return db
    .prepare(
      `SELECT ts, checks, failures, slow, latency_sum_ms FROM status_hourly
       WHERE service_id = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC`
    )
    .all(id, from, to) as HourlyRow[];
}

/** Rows of services that exist, or wait in the trash and may come back. */
const ORPHANED = "service_id NOT IN (SELECT id FROM services UNION SELECT id FROM service_trash)";

/**
 * Deletes results and hourly totals past their retention, and all status data of services that
 * are gone for good. Returns how many rows went.
 */
export function pruneStatusHistory(db: Database, now: number): number {
  return db.transaction(() => {
    const statements = [
      ["DELETE FROM status_results WHERE ts < ?", now - STATUS_RESULTS_RETENTION_MS],
      ["DELETE FROM status_hourly WHERE ts < ?", now - STATUS_HOURLY_RETENTION_MS],
    ] as const;
    let removed = 0;
    for (const [sql, cutoff] of statements) removed += db.prepare(sql).run(cutoff).changes;
    for (const table of ["status_results", "status_hourly", "service_status"]) {
      removed += db.prepare(`DELETE FROM ${table} WHERE ${ORPHANED}`).run().changes;
    }
    return removed;
  })();
}
