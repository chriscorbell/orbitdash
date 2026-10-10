import { describe, expect, it } from "bun:test";
import {
  CONFIRM_DELAY_MS,
  createStatusScheduler,
  INTERVAL_JITTER,
  type ScheduledCheck,
} from "./scheduler";
import type { CheckResult } from "./state";

const PASSED: CheckResult = { ok: true, latencyMs: 10, statusCode: 200, error: null };
const FAILED: CheckResult = { ok: false, latencyMs: null, statusCode: null, error: "Timed out" };

interface Run {
  check: ScheduledCheck;
  signal: AbortSignal;
  resolve: (result: CheckResult) => void;
  reject: (error: unknown) => void;
}

function check(id: string, intervalMs = 60_000, key = `http http://${id}/`): ScheduledCheck {
  return {
    id,
    intervalMs,
    key,
    ignoreTls: false,
    target: { method: "http", url: `http://${id}/` },
  };
}

function setup({
  concurrency = 8,
  random = () => 0.5,
  onResult = () => false,
}: {
  concurrency?: number;
  random?: () => number;
  onResult?: (check: ScheduledCheck, result: CheckResult) => boolean;
} = {}) {
  let time = 0;
  const runs: Run[] = [];
  const results: Array<{ id: string; result: CheckResult }> = [];
  const scheduler = createStatusScheduler({
    concurrency,
    now: () => time,
    random,
    run: (scheduled, signal) =>
      new Promise((resolve, reject) => runs.push({ check: scheduled, signal, resolve, reject })),
    onResult: (scheduled, result) => {
      results.push({ id: scheduled.id, result });
      return onResult(scheduled, result);
    },
  });
  return {
    scheduler,
    runs,
    results,
    setTime: (value: number) => (time = value),
    running: () => runs.filter((run) => !run.signal.aborted).map((run) => run.check.id),
  };
}

const settle = () => Bun.sleep(0);

describe("status scheduler", () => {
  it("starts each check at its first run time, then once per interval from its start", async () => {
    const s = setup();
    s.scheduler.sync([check("a"), check("b")], (scheduled) => (scheduled.id === "a" ? 0 : 5_000));

    s.scheduler.tick();
    expect(s.runs.map((run) => run.check.id)).toEqual(["a"]);

    s.setTime(4_000);
    s.runs[0].resolve(PASSED);
    await settle();
    expect(s.results).toEqual([{ id: "a", result: PASSED }]);
    // random() = 0.5 means no jitter, and the interval counts from when the check started.
    expect(s.scheduler.nextRunAt("a")).toBe(60_000);

    s.setTime(5_000);
    s.scheduler.tick();
    s.scheduler.tick();
    expect(s.runs.map((run) => run.check.id)).toEqual(["a", "b"]);
  });

  it("moves each next run by up to a tenth of the interval", async () => {
    for (const [random, expected] of [
      [0, 60_000 * (1 - INTERVAL_JITTER)],
      [1, 60_000 * (1 + INTERVAL_JITTER)],
    ] as const) {
      const s = setup({ random: () => random });
      s.scheduler.sync([check("a")], () => 0);
      s.scheduler.tick();
      s.runs[0].resolve(PASSED);
      await settle();
      expect(s.scheduler.nextRunAt("a")).toBe(expected);
    }
  });

  it("never runs more checks at once than the limit, earliest due first", async () => {
    const s = setup({ concurrency: 3 });
    const checks = ["e", "d", "c", "b", "a"].map((id) => check(id));
    const dueAt: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    s.scheduler.sync(checks, (scheduled) => dueAt[scheduled.id]);

    s.setTime(10);
    s.scheduler.tick();
    expect(s.running()).toEqual(["a", "b", "c"]);
    expect(s.scheduler.runningCount()).toBe(3);

    s.scheduler.tick();
    expect(s.runs).toHaveLength(3);

    // A finished check frees its slot for the next one straight away.
    s.runs[1].resolve(PASSED);
    await settle();
    expect(s.runs.map((run) => run.check.id)).toEqual(["a", "b", "c", "d"]);
    expect(s.scheduler.runningCount()).toBe(3);
  });

  it("confirms a first failure soon instead of waiting a full interval", async () => {
    const s = setup({ onResult: (_check, result) => !result.ok });
    s.scheduler.sync([check("slow", 3_600_000), check("fast", 10_000)], () => 0);
    s.scheduler.tick();
    s.runs[0].resolve(FAILED);
    s.runs[1].resolve(FAILED);
    await settle();

    expect(s.scheduler.nextRunAt("slow")).toBe(CONFIRM_DELAY_MS);
    expect(s.scheduler.nextRunAt("fast")).toBe(10_000);
  });

  it("reports a check that throws as failed", async () => {
    const s = setup();
    s.scheduler.sync([check("a")], () => 0);
    s.scheduler.tick();
    s.runs[0].reject(new Error("boom"));
    await settle();
    expect(s.results).toEqual([
      { id: "a", result: { ok: false, latencyMs: null, statusCode: null, error: "Check failed" } },
    ]);
  });

  it("keeps its cadence when the result handler throws", async () => {
    const s = setup({
      onResult: () => {
        throw new Error("database is locked");
      },
    });
    s.scheduler.sync([check("a")], () => 0);
    s.scheduler.tick();
    s.runs[0].resolve(PASSED);
    await settle();
    expect(s.scheduler.nextRunAt("a")).toBe(60_000);
  });

  it("cancels removed checks and drops their results", async () => {
    const s = setup();
    s.scheduler.sync([check("a"), check("b")], () => 0);
    s.scheduler.tick();

    expect(s.scheduler.sync([check("b")], () => 0)).toEqual({ started: [], removed: ["a"] });
    expect(s.runs[0].signal.aborted).toBe(true);
    s.runs[0].resolve(PASSED);
    await settle();

    expect(s.results).toEqual([]);
    expect(s.scheduler.nextRunAt("a")).toBeUndefined();
    expect(s.scheduler.runningCount()).toBe(1);
  });

  it("starts over when a check's target changes, dropping the old result", async () => {
    const s = setup();
    s.scheduler.sync([check("a")], () => 0);
    s.scheduler.tick();

    const changed = check("a", 60_000, "tcp nas:22");
    expect(s.scheduler.sync([changed], () => 1_500)).toEqual({ started: [changed], removed: [] });
    expect(s.runs[0].signal.aborted).toBe(true);
    expect(s.scheduler.nextRunAt("a")).toBe(1_500);

    s.runs[0].resolve(PASSED);
    await settle();
    expect(s.results).toEqual([]);

    s.setTime(1_500);
    s.scheduler.tick();
    expect(s.runs.at(-1)?.check.key).toBe("tcp nas:22");
  });

  it("brings the next run closer when the interval shrinks", async () => {
    const s = setup();
    s.scheduler.sync([check("a", 3_600_000)], () => 0);
    s.scheduler.tick();
    s.runs[0].resolve(PASSED);
    await settle();
    expect(s.scheduler.nextRunAt("a")).toBe(3_600_000);

    s.setTime(1_000);
    const unchanged = s.scheduler.sync([check("a", 30_000)], () => 0);
    expect(unchanged).toEqual({ started: [], removed: [] });
    expect(s.scheduler.nextRunAt("a")).toBe(31_000);

    // A longer interval leaves the next run where it was.
    s.scheduler.sync([check("a", 60_000)], () => 0);
    expect(s.scheduler.nextRunAt("a")).toBe(31_000);
  });

  it("cancels everything on stop and ignores later results and ticks", async () => {
    const s = setup();
    s.scheduler.sync([check("a"), check("b")], () => 0);
    s.scheduler.tick();
    s.scheduler.stop();

    expect(s.runs.every((run) => run.signal.aborted)).toBe(true);
    for (const run of s.runs) run.resolve(PASSED);
    await settle();
    expect(s.results).toEqual([]);

    s.scheduler.tick();
    expect(s.runs).toHaveLength(2);
    expect(s.scheduler.runningCount()).toBe(0);
  });
});
