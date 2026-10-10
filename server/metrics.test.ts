import { afterEach, describe, expect, it } from "bun:test";
import os from "os";
import { hostSnapshotSchema } from "@shared/host-schemas";
import type { HostSnapshot } from "@shared/types";
import { createFakeHostFs } from "./host/test-fixtures";
import {
  ACTIVE_SAMPLE_INTERVAL_MS,
  getDiskUsage,
  getLatestSnapshot,
  getRecentSamples,
  IDLE_SAMPLE_INTERVAL_MS,
  stopCollection,
  subscribe,
  subscribeSnapshots,
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

describe("host snapshots", () => {
  it("samples every second for snapshot subscribers and hands them the tick's snapshot", () => {
    const snapshots: HostSnapshot[] = [];
    unsubscribers.push(subscribeSnapshots((snapshot) => snapshots.push(snapshot)));
    const start = Date.now() + 6_000_000;

    const first = tickCollection(start);
    const second = tickCollection(start + ACTIVE_SAMPLE_INTERVAL_MS);

    expect(second).not.toBeNull();
    expect(snapshots.map((snapshot) => snapshot.ts)).toEqual([first!.ts, second!.ts]);
    expect(hostSnapshotSchema.parse(snapshots[1])).toEqual(snapshots[1]);
    // The strip's sample and the snapshot come from the same reading.
    expect(second!.cpu).toBe(snapshots[1].cpu.usage ?? 0);
    expect(getLatestSnapshot()).toBe(snapshots[1]);
  });

  it("drops snapshot subscribers that throw", () => {
    let calls = 0;
    unsubscribers.push(
      subscribeSnapshots(() => {
        calls += 1;
        throw new Error("gone");
      })
    );
    const start = Date.now() + 7_000_000;

    tickCollection(start);
    tickCollection(start + IDLE_SAMPLE_INTERVAL_MS);

    expect(calls).toBe(1);
  });

  it("always has a snapshot to serve", () => {
    expect(hostSnapshotSchema.safeParse(getLatestSnapshot()).success).toBe(true);
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

  it("reads the configured path on the host when a host root is set", () => {
    const hostFs = createFakeHostFs(
      {},
      { "/srv": { blocks: 100, bsize: 4096, bavail: 25, bfree: 30 } },
      "/mnt/host"
    );
    expect(getDiskUsage("/srv", hostFs)).toBe(75);
    expect(getDiskUsage("/mnt/host/srv", hostFs)).toBe(75);
    expect(getDiskUsage("/", hostFs)).toBe(0);
  });
});
