import { describe, expect, it } from "bun:test";
import { cpuPercent, perSecond, roundPercent } from "./rates";

describe("cpuPercent", () => {
  it("is the busy share of the elapsed CPU time", () => {
    expect(cpuPercent({ idle: 175, total: 300 }, { idle: 100, total: 200 })).toBe(25);
    expect(cpuPercent({ idle: 100, total: 300 }, { idle: 100, total: 200 })).toBe(100);
    expect(cpuPercent({ idle: 133.3, total: 301 }, { idle: 100, total: 200 })).toBe(67.03);
  });

  it("is null for the first reading and when counters stall or go backwards", () => {
    expect(cpuPercent({ idle: 1, total: 2 }, undefined)).toBeNull();
    expect(cpuPercent({ idle: 100, total: 200 }, { idle: 100, total: 200 })).toBeNull();
    expect(cpuPercent({ idle: 10, total: 20 }, { idle: 100, total: 200 })).toBeNull();
  });

  it("keeps idle within the elapsed time when iowait steps backwards", () => {
    expect(cpuPercent({ idle: 90, total: 300 }, { idle: 100, total: 200 })).toBe(100);
    expect(cpuPercent({ idle: 400, total: 300 }, { idle: 100, total: 200 })).toBe(0);
  });
});

describe("perSecond", () => {
  it("averages a counter's increase over the elapsed time", () => {
    expect(perSecond(3000, 1000, 1000)).toBe(2000);
    expect(perSecond(3000, 1000, 2000)).toBe(1000);
    expect(perSecond(1000, 1000, 1000)).toBe(0);
    expect(perSecond(1001, 1000, 3000)).toBe(0);
  });

  it("is null without a previous value or elapsed time, and after a reset", () => {
    expect(perSecond(1000, undefined, 1000)).toBeNull();
    expect(perSecond(1000, 0, null)).toBeNull();
    expect(perSecond(1000, 0, 0)).toBeNull();
    expect(perSecond(10, 1000, 1000)).toBeNull();
  });
});

describe("roundPercent", () => {
  it("rounds to two decimals", () => {
    expect(roundPercent(12.345678)).toBe(12.35);
    expect(roundPercent(100)).toBe(100);
  });
});
