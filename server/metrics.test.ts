import { afterEach, describe, expect, it } from "bun:test";
import os from "os";
import {
  ACTIVE_SAMPLE_INTERVAL_MS,
  getDiskUsage,
  getRecentSamples,
  IDLE_SAMPLE_INTERVAL_MS,
  stopCollection,
  subscribe,
  tickCollection,
} from "./metrics";

const unsubscribers: Array<() => void> = [];

afterEach(() => {
  stopCollection();
  while (unsubscribers.length > 0) unsubscribers.pop()!();
});

describe("metrics collection", () => {
  it("samples every 10 seconds while nobody is watching", () => {
    const start = Date.now() + 1_000_000;

    expect(tickCollection(start)).not.toBeNull();
    expect(tickCollection(start + ACTIVE_SAMPLE_INTERVAL_MS)).toBeNull();
    expect(tickCollection(start + IDLE_SAMPLE_INTERVAL_MS - 100)).toBeNull();
    expect(tickCollection(start + IDLE_SAMPLE_INTERVAL_MS)).not.toBeNull();
  });

  it("samples every second for live subscribers and delivers each sample", () => {
    const received: number[] = [];
    unsubscribers.push(subscribe((sample) => received.push(sample.ts)));
    const start = Date.now() + 2_000_000;

    const first = tickCollection(start);
    // A timer firing a few milliseconds early still counts as the next second.
    const second = tickCollection(start + ACTIVE_SAMPLE_INTERVAL_MS - 10);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(received).toHaveLength(2);
  });

  it("drops subscribers that throw", () => {
    let calls = 0;
    unsubscribers.push(
      subscribe(() => {
        calls += 1;
        throw new Error("gone");
      })
    );
    const start = Date.now() + 3_000_000;

    tickCollection(start);
    tickCollection(start + IDLE_SAMPLE_INTERVAL_MS);

    expect(calls).toBe(1);
  });

  it("keeps collected samples for the recent window", () => {
    const sample = tickCollection(Date.now() + 4_000_000);
    expect(sample).not.toBeNull();
    expect(getRecentSamples(60).at(-1)?.ts).toBe(sample!.ts);
  });
});

describe("disk usage", () => {
  it("reads usage for a real mount without spawning processes", () => {
    const usage = getDiskUsage(os.tmpdir());
    expect(usage).toBeGreaterThan(0);
    expect(usage).toBeLessThanOrEqual(100);
  });

  it("returns 0 for a path that does not exist", () => {
    expect(getDiskUsage("/definitely/not/a/mount")).toBe(0);
  });
});
