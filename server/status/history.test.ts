import { describe, expect, it } from "bun:test";
import {
  bucketHourly,
  bucketResults,
  buildStatusHistory,
  planStatusHistory,
  uptimePercent,
} from "./history";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// 2026-10-10 14:47:30 UTC
const NOW = Date.UTC(2026, 9, 10, 14, 47, 30);

describe("planStatusHistory", () => {
  it("covers 24 hours in 48 half hours, the last one holding now", () => {
    const plan = planStatusHistory("24h", NOW);
    expect(plan).toEqual({
      range: "24h",
      source: "results",
      bucketMs: 30 * MINUTE,
      count: 48,
      from: Date.UTC(2026, 9, 9, 15, 0),
    });
    const lastStart = plan.from + (plan.count - 1) * plan.bucketMs;
    expect(lastStart).toBe(Date.UTC(2026, 9, 10, 14, 30));
    expect(NOW - plan.from).toBeLessThan(DAY);
  });

  it("covers 30 days ending with the current hour", () => {
    expect(planStatusHistory("30d", NOW)).toEqual({
      range: "30d",
      source: "hourly",
      bucketMs: DAY,
      count: 30,
      from: Date.UTC(2026, 9, 10, 15, 0) - 30 * DAY,
    });
  });
});

describe("bucketing", () => {
  it("tallies raw results per bucket and averages passing latencies", () => {
    const plan = planStatusHistory("24h", NOW);
    const last = plan.from + 47 * plan.bucketMs;
    const buckets = bucketResults(plan, [
      { ts: plan.from - 1, ok: 1, latency_ms: 5 }, // before the range
      { ts: plan.from, ok: 1, latency_ms: 20 },
      { ts: plan.from + 60_000, ok: 1, latency_ms: 2_500 },
      { ts: plan.from + 120_000, ok: 0, latency_ms: null },
      { ts: last + 1, ok: 0, latency_ms: null },
      { ts: last + 2, ok: 1, latency_ms: null },
    ]);

    expect(buckets).toHaveLength(48);
    expect(buckets[0]).toEqual({
      ts: plan.from,
      checks: 3,
      failures: 1,
      slow: 1,
      latencyMs: 1_260,
    });
    expect(buckets[1]).toEqual({
      ts: plan.from + plan.bucketMs,
      checks: 0,
      failures: 0,
      slow: 0,
      latencyMs: null,
    });
    expect(buckets[47]).toMatchObject({ checks: 2, failures: 1, latencyMs: 0 });
  });

  it("adds hourly totals into days", () => {
    const plan = planStatusHistory("30d", NOW);
    const buckets = bucketHourly(plan, [
      { ts: plan.from, checks: 60, failures: 0, slow: 2, latency_sum_ms: 1_200 },
      { ts: plan.from + HOUR, checks: 60, failures: 60, slow: 0, latency_sum_ms: 0 },
      {
        ts: plan.from + 29 * DAY + 23 * HOUR,
        checks: 30,
        failures: 0,
        slow: 0,
        latency_sum_ms: 300,
      },
    ]);

    expect(buckets[0]).toEqual({
      ts: plan.from,
      checks: 120,
      failures: 60,
      slow: 2,
      latencyMs: 20,
    });
    expect(buckets[29]).toMatchObject({ checks: 30, latencyMs: 10 });
  });
});

describe("uptime", () => {
  it("rounds down, so a single failure never reads as 100%", () => {
    expect(uptimePercent(0, 0)).toBeNull();
    expect(uptimePercent(4, 1)).toBe(75);
    expect(uptimePercent(20_000, 1)).toBe(99.99);
    expect(uptimePercent(10, 0)).toBe(100);
  });

  it("builds the response over every bucket", () => {
    const plan = planStatusHistory("24h", NOW);
    const buckets = bucketResults(plan, [
      { ts: plan.from, ok: 1, latency_ms: 10 },
      { ts: NOW, ok: 0, latency_ms: null },
    ]);
    expect(buildStatusHistory("svc", plan, buckets, NOW)).toEqual({
      id: "svc",
      range: "24h",
      resolutionMs: 30 * MINUTE,
      from: plan.from,
      to: NOW,
      uptime: 50,
      buckets,
    });
  });
});
