import { describe, expect, it } from "vitest";
import {
  describeProblem,
  describeSince,
  formatClock,
  formatLatency,
  formatUptimePercent,
} from "@/components/status/status-format";
import {
  checkIntervalOptions,
  formatCheckInterval,
} from "@/components/services/status-check-options";
import type { ServiceStatus } from "@shared/types";

const NOW = new Date(2026, 9, 10, 15, 30).getTime();
const status = (patch: Partial<ServiceStatus>): ServiceStatus => ({
  id: "svc",
  state: "up",
  latencyMs: 40,
  statusCode: 200,
  error: null,
  checkedAt: NOW,
  changedAt: NOW,
  ...patch,
});

describe("status formatting", () => {
  it("formats latency and uptime compactly", () => {
    expect(formatLatency(41.6)).toBe("42 ms");
    expect(formatLatency(1_234)).toBe("1.2 s");
    expect(formatUptimePercent(100)).toBe("100%");
    expect(formatUptimePercent(0)).toBe("0%");
    expect(formatUptimePercent(99.5)).toBe("99.50%");
  });

  it("shows a clock time today and a date before that", () => {
    const today = new Date(2026, 9, 10, 9, 5).getTime();
    const yesterday = new Date(2026, 9, 9, 23, 59).getTime();
    expect(formatClock(today, NOW)).toBe(
      new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(today)
    );
    expect(formatClock(yesterday, NOW)).not.toBe(formatClock(today, NOW));
    expect(formatClock(yesterday, NOW)).toContain(
      new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(yesterday)
    );
  });

  it("says how long a status has held", () => {
    expect(describeSince(status({ state: "unknown", changedAt: null }), NOW)).toBeNull();
    expect(describeSince(status({ changedAt: null }), NOW)).toBeNull();
    expect(describeSince(status({ changedAt: NOW - 30_000 }), NOW)).toBe("Up for under a minute");
    expect(describeSince(status({ state: "degraded", changedAt: NOW - 3_900_000 }), NOW)).toBe(
      "Up for 1h 5m"
    );
    expect(describeSince(status({ state: "down", changedAt: NOW - 60_000 }), NOW)).toBe(
      `Down since ${formatClock(NOW - 60_000, NOW)}`
    );
  });

  it("explains a failure, separating a single miss from an outage", () => {
    expect(describeProblem(status({}))).toBeNull();
    expect(describeProblem(status({ state: "unknown", error: "Timed out" }))).toBeNull();
    expect(describeProblem(status({ state: "down", error: "HTTP 503" }))).toBe("HTTP 503");
    expect(describeProblem(status({ error: "Timed out" }))).toBe("Last check failed: Timed out");
  });
});

describe("check interval options", () => {
  it("names intervals plainly", () => {
    expect(formatCheckInterval(15)).toBe("15 sec");
    expect(formatCheckInterval(90)).toBe("90 sec");
    expect(formatCheckInterval(300)).toBe("5 min");
    expect(formatCheckInterval(3_600)).toBe("1 hour");
    expect(formatCheckInterval(7_200)).toBe("2 hours");
  });

  it("offers the presets, plus an interval set some other way", () => {
    expect(checkIntervalOptions(60)).toEqual([15, 30, 60, 300, 900, 3600]);
    expect(checkIntervalOptions(120)).toEqual([15, 30, 60, 120, 300, 900, 3600]);
  });
});
