import type { Database } from "bun:sqlite";
import type { ConfigChangedEvent, ServerEvent } from "@shared/events";
import { describeCheckTarget, resolveCheckTarget } from "@shared/status";
import type { ServiceStatus, StatusHistory, StatusHistoryRange } from "@shared/types";
import { getDb } from "../db";
import { publish, subscribeEvents } from "../events";
import { writeLog } from "../observability";
import { createChecker, type RunCheck } from "./checker";
import { bucketHourly, bucketResults, buildStatusHistory, planStatusHistory } from "./history";
import { createStatusScheduler, type ScheduledCheck, type StatusScheduler } from "./scheduler";
import {
  applyCheckResult,
  needsConfirmation,
  toServiceStatus,
  unknownStatus,
  type CheckResult,
  type StoredStatus,
} from "./state";
import {
  deleteStatus,
  pruneStatusHistory,
  readEnabledChecks,
  readHourly,
  readResults,
  readStoredStatuses,
  recordCheckResult,
  serviceExists,
  writeStatus,
  type CheckRow,
} from "./store";

/** At startup, first checks spread over up to this long, so 50 services don't fire at once. */
export const STARTUP_SPREAD_MS = 30_000;
/** A check that was just turned on or changed runs within this. */
export const CHANGE_SPREAD_MS = 2_000;
/** A failing database is reported at most this often. */
const ERROR_LOG_INTERVAL_MS = 60_000;

export interface StatusMonitorOptions {
  concurrency?: number;
  getDatabase: () => Database;
  now?: () => number;
  publish: (event: ServerEvent) => void;
  random?: () => number;
  runCheck: RunCheck;
  /** Config changes mark the checks for a reload on the next tick. */
  subscribeConfig: (listener: (event: ConfigChangedEvent) => void) => () => void;
}

export interface StatusMonitor {
  /** Loads checks and their last statuses and starts listening for config changes. */
  start: () => void;
  /** Cancels running checks; nothing is written after this returns. */
  stop: () => void;
  /** Reloads checks if config changed, then starts the checks that are due. Run every second. */
  tick: () => void;
  /** Reloads checks on the next tick. */
  refresh: () => void;
  isRunning: () => boolean;
  /** Current status of every service with checks on, read from the database. */
  list: () => ServiceStatus[];
  /** Null when the service doesn't exist. */
  history: (id: string, range: StatusHistoryRange, now: number) => StatusHistory | null;
  prune: (now: number) => number;
}

/** Turns a service row into a check, or null if it has no usable target. */
export function toScheduledCheck(row: CheckRow): ScheduledCheck | null {
  const target = resolveCheckTarget(row, row.url);
  if (!target) return null;
  // Certificates only matter to HTTPS, so the option only changes an HTTP check's key.
  const ignoreTls = target.method === "http" && row.check_ignore_tls === 1;
  return {
    id: row.id,
    intervalMs: row.check_interval * 1000,
    key: `${target.method} ${describeCheckTarget(target)}${ignoreTls ? " insecure" : ""}`,
    ignoreTls,
    target,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export function createStatusMonitor(options: StatusMonitorOptions): StatusMonitor {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const statuses = new Map<string, StoredStatus>();
  let scheduler: StatusScheduler | null = null;
  let stopConfig: (() => void) | null = null;
  let dirty = false;
  let lastErrorAt = Number.NEGATIVE_INFINITY;

  const loadChecks = (db: Database) =>
    readEnabledChecks(db)
      .map(toScheduledCheck)
      .filter((check): check is ScheduledCheck => check !== null);

  const publishStatus = (id: string, status: StoredStatus | null) =>
    options.publish({ type: "status", id, status: status ? toServiceStatus(status) : null });

  /** The database failing once a second (each check, each tick) is logged once a minute. */
  function reportError(event: "status.write_failed" | "status.reload_failed", error: unknown) {
    const time = now();
    if (time - lastErrorAt < ERROR_LOG_INTERVAL_MS) return;
    lastErrorAt = time;
    writeLog("error", event, { message: errorMessage(error) });
  }

  function handleResult(check: ScheduledCheck, result: CheckResult): boolean {
    const previous = statuses.get(check.id) ?? unknownStatus(check.id, check.key);
    const time = now();
    const next = applyCheckResult(previous, result, time);
    try {
      recordCheckResult(options.getDatabase(), next, result, time);
    } catch (error) {
      reportError("status.write_failed", error);
      return false;
    }

    statuses.set(check.id, next);
    // Only the service id and the short reason: targets can hold credentials.
    if (previous.state !== next.state) {
      writeLog("info", "status.changed", {
        serviceId: check.id,
        from: previous.state,
        to: next.state,
        reason: next.error,
      });
    } else if (!result.ok) {
      writeLog("debug", "status.check_failed", { serviceId: check.id, reason: result.error });
    }
    publishStatus(check.id, next);
    return needsConfirmation(next);
  }

  /** Brings the scheduler in line with the database; new and changed checks start as unknown. */
  function sync(active: StatusScheduler, firstRunAt: (check: ScheduledCheck) => number) {
    const db = options.getDatabase();
    const { started, removed } = active.sync(loadChecks(db), firstRunAt);

    for (const id of removed) {
      statuses.delete(id);
      deleteStatus(db, id);
      publishStatus(id, null);
    }
    for (const check of started) {
      if (statuses.get(check.id)?.targetKey === check.key) continue;
      const fresh = unknownStatus(check.id, check.key);
      writeStatus(db, fresh);
      statuses.set(check.id, fresh);
      publishStatus(check.id, fresh);
    }
  }

  return {
    start() {
      if (scheduler) return;
      const db = options.getDatabase();
      statuses.clear();
      for (const status of readStoredStatuses(db)) statuses.set(status.serviceId, status);

      const active = createStatusScheduler({
        concurrency: options.concurrency,
        now,
        random,
        run: (check, signal) =>
          options.runCheck({ target: check.target, ignoreTls: check.ignoreTls, signal }),
        onResult: handleResult,
      });
      scheduler = active;

      // A status kept from before the restart keeps its cadence; the rest spread out.
      const time = now();
      sync(active, (check) => {
        const spread = time + random() * Math.min(check.intervalMs, STARTUP_SPREAD_MS);
        const stored = statuses.get(check.id);
        return stored?.targetKey === check.key && stored.checkedAt !== null
          ? Math.max(stored.checkedAt + check.intervalMs, spread)
          : spread;
      });

      // Statuses of checks turned off, or services deleted, while the server was down.
      for (const id of [...statuses.keys()]) {
        if (active.nextRunAt(id) !== undefined) continue;
        statuses.delete(id);
        deleteStatus(db, id);
      }

      dirty = false;
      stopConfig = options.subscribeConfig((event) => {
        if (event.scope !== "settings") dirty = true;
      });
    },

    stop() {
      stopConfig?.();
      stopConfig = null;
      scheduler?.stop();
      scheduler = null;
      statuses.clear();
      dirty = false;
    },

    tick() {
      if (!scheduler) return;
      if (dirty) {
        const time = now();
        try {
          sync(scheduler, () => time + random() * CHANGE_SPREAD_MS);
          dirty = false;
        } catch (error) {
          // Stays marked, so the next tick tries again.
          reportError("status.reload_failed", error);
        }
      }
      scheduler.tick();
    },

    refresh() {
      dirty = true;
    },

    isRunning: () => scheduler !== null,

    list() {
      const db = options.getDatabase();
      const stored = new Map(readStoredStatuses(db).map((status) => [status.serviceId, status]));
      return readEnabledChecks(db).map((row) => {
        const key = toScheduledCheck(row)?.key ?? "";
        const status = stored.get(row.id);
        // A status left from an older target says nothing about the current one.
        return toServiceStatus(status?.targetKey === key ? status : unknownStatus(row.id, key));
      });
    },

    history(id, range, time) {
      const db = options.getDatabase();
      if (!serviceExists(db, id)) return null;
      const plan = planStatusHistory(range, time);
      const buckets =
        plan.source === "results"
          ? bucketResults(plan, readResults(db, id, plan.from, time))
          : bucketHourly(plan, readHourly(db, id, plan.from, time));
      return buildStatusHistory(id, plan, buckets, time);
    },

    prune(time) {
      return pruneStatusHistory(options.getDatabase(), time);
    },
  };
}

/** The server's monitor: runtime.ts starts it with the background jobs and stops it at shutdown. */
export const statusMonitor = createStatusMonitor({
  getDatabase: getDb,
  publish,
  runCheck: createChecker(),
  subscribeConfig: (listener) =>
    subscribeEvents(["config"], (event) => {
      if (event.type === "config.changed") listener(event);
    }),
});
