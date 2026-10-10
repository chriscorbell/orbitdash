import type { CheckTarget } from "@shared/status";
import type { CheckResult } from "./state";

/** Checks running at once across all services. */
export const DEFAULT_CONCURRENCY = 8;
/** Each next run moves by up to this share of the interval, so checks never fall into lockstep. */
export const INTERVAL_JITTER = 0.1;
/** How soon a first failure is checked again, so a real outage shows within seconds, not minutes. */
export const CONFIRM_DELAY_MS = 15_000;

export interface ScheduledCheck {
  id: string; // service id
  intervalMs: number;
  /** Names the target and options; a check whose key changes starts over. */
  key: string;
  ignoreTls: boolean;
  target: CheckTarget;
}

export interface SchedulerOptions {
  concurrency?: number;
  now: () => number;
  random: () => number;
  run: (check: ScheduledCheck, signal: AbortSignal) => Promise<CheckResult>;
  /**
   * Takes a finished check's result. Returning true asks for a quick confirmation run (a first
   * failure) instead of waiting a full interval.
   */
  onResult: (check: ScheduledCheck, result: CheckResult) => boolean;
}

export interface SyncResult {
  /** New checks, and checks whose key changed. */
  started: ScheduledCheck[];
  /** Ids no longer checked. */
  removed: string[];
}

export interface StatusScheduler {
  /**
   * Makes the scheduled set match `checks`. A new or changed check first runs at `firstRunAt`;
   * a check whose interval shrank runs no later than one new interval from now.
   */
  sync: (
    checks: readonly ScheduledCheck[],
    firstRunAt: (check: ScheduledCheck) => number
  ) => SyncResult;
  /** Starts every due check that fits under the concurrency limit, earliest first. */
  tick: () => void;
  /** Cancels running checks and forgets everything; later results are dropped. */
  stop: () => void;
  /** When a check runs next, for tests and diagnostics. */
  nextRunAt: (id: string) => number | undefined;
  runningCount: () => number;
}

interface Entry {
  check: ScheduledCheck;
  dueAt: number;
  running: AbortController | null;
}

export function createStatusScheduler({
  concurrency = DEFAULT_CONCURRENCY,
  now,
  random,
  run,
  onResult,
}: SchedulerOptions): StatusScheduler {
  const entries = new Map<string, Entry>();
  let running = 0;
  let stopped = false;

  const jittered = (ms: number) => ms + (random() * 2 - 1) * ms * INTERVAL_JITTER;

  function finish(
    entry: Entry,
    controller: AbortController,
    startedAt: number,
    result: CheckResult
  ) {
    running -= 1;
    if (entry.running === controller) entry.running = null;
    // Dropped when stopped, or when the check was changed or removed while it ran.
    if (stopped || controller.signal.aborted || entries.get(entry.check.id) !== entry) return;

    let confirm = false;
    try {
      confirm = onResult(entry.check, result);
    } catch {
      // The handler reports its own failures; the check keeps its normal cadence regardless.
    }
    const delay = confirm
      ? Math.min(entry.check.intervalMs, CONFIRM_DELAY_MS)
      : entry.check.intervalMs;
    // Measured from the start, so the cadence holds however long a check took.
    entry.dueAt = startedAt + jittered(delay);
    tick();
  }

  function start(entry: Entry) {
    const controller = new AbortController();
    const startedAt = now();
    entry.running = controller;
    running += 1;
    run(entry.check, controller.signal).then(
      (result) => finish(entry, controller, startedAt, result),
      () =>
        finish(entry, controller, startedAt, {
          ok: false,
          latencyMs: null,
          statusCode: null,
          error: "Check failed",
        })
    );
  }

  function tick() {
    if (stopped) return;
    const time = now();
    const due = [...entries.values()]
      .filter((entry) => entry.running === null && entry.dueAt <= time)
      .sort((left, right) => left.dueAt - right.dueAt);
    for (const entry of due) {
      if (running >= concurrency) return;
      start(entry);
    }
  }

  return {
    sync(checks, firstRunAt) {
      const wanted = new Map(checks.map((check) => [check.id, check]));
      const result: SyncResult = { started: [], removed: [] };

      for (const [id, entry] of entries) {
        if (wanted.has(id)) continue;
        entry.running?.abort();
        entries.delete(id);
        result.removed.push(id);
      }

      for (const check of checks) {
        const entry = entries.get(check.id);
        if (!entry || entry.check.key !== check.key) {
          entry?.running?.abort();
          entries.set(check.id, { check, dueAt: firstRunAt(check), running: null });
          result.started.push(check);
        } else if (entry.check.intervalMs !== check.intervalMs) {
          entry.dueAt = Math.min(entry.dueAt, now() + check.intervalMs);
          entry.check = check;
        }
      }

      return result;
    },

    tick,

    stop() {
      stopped = true;
      for (const entry of entries.values()) entry.running?.abort();
      entries.clear();
    },

    nextRunAt: (id) => entries.get(id)?.dueAt,
    runningCount: () => running,
  };
}
