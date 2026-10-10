import { describe, expect, it } from "vitest";
import {
  appendSnapshot,
  hasReadings,
  latestReading,
  seriesFromHistory,
  seriesFromSnapshots,
  thresholdTone,
  withAlpha,
} from "@/lib/stats-data";
import type { HostSnapshot, MetricHistory } from "@shared/types";

function snapshot(ts: number, overrides: Partial<HostSnapshot> = {}): HostSnapshot {
  return {
    version: 1,
    ts,
    intervalMs: 1000,
    cpu: {
      usage: 25,
      cores: [],
      load: { one: 0.5, five: 0.4, fifteen: 0.3 },
      frequencyMhz: null,
      temperatureCelsius: 48,
    },
    memory: {
      totalBytes: 1000,
      usedBytes: 250,
      availableBytes: 750,
      cachedBytes: null,
      swapTotalBytes: null,
      swapUsedBytes: null,
    },
    temperatures: [],
    filesystems: [],
    disks: [
      { name: "sda", readBytesPerSec: 10, writeBytesPerSec: 20 },
      { name: "sdb", readBytesPerSec: 5, writeBytesPerSec: null },
    ],
    network: [
      { name: "eth0", rxBytesPerSec: 100, txBytesPerSec: 50 },
      { name: "wlan0", rxBytesPerSec: null, txBytesPerSec: null },
    ],
    ...overrides,
  };
}

describe("appendSnapshot", () => {
  it("adds newer readings, ignores repeats and keeps the window", () => {
    let buffer = appendSnapshot([], snapshot(1));
    buffer = appendSnapshot(buffer, snapshot(2));
    expect(appendSnapshot(buffer, snapshot(2))).toBe(buffer);
    expect(appendSnapshot(buffer, snapshot(3), 2).map((entry) => entry.ts)).toEqual([2, 3]);
  });
});

describe("seriesFromSnapshots", () => {
  it("turns readings into chart columns, summing interfaces and disks", () => {
    const series = seriesFromSnapshots([
      snapshot(1),
      snapshot(2, { memory: null, network: [], disks: [] }),
    ]);
    expect(series.ts).toEqual([1, 2]);
    expect(series.cpu).toEqual([25, 25]);
    expect(series.cpuMax).toEqual(series.cpu);
    expect(series.memory).toEqual([25, null]);
    expect(series.netRx).toEqual([100, null]);
    expect(series.netTx).toEqual([50, null]);
    expect(series.diskRead).toEqual([15, null]);
    expect(series.diskWrite).toEqual([20, null]);
    expect(series.temperature).toEqual([48, 48]);
    expect(series.load1).toEqual([0.5, 0.5]);
  });

  it("leaves load empty when the host has none", () => {
    const base = snapshot(1);
    expect(seriesFromSnapshots([{ ...base, cpu: { ...base.cpu, load: null } }]).load1).toEqual([
      null,
    ]);
  });
});

describe("seriesFromHistory", () => {
  it("uses averages for lines and CPU peaks for the band", () => {
    const column = (value: number | null) => ({
      avg: [value],
      max: [value === null ? null : value + 10],
    });
    const history: MetricHistory = {
      range: "1h",
      resolutionMs: 60_000,
      from: 0,
      to: 60_000,
      ts: [0],
      series: {
        cpu: column(20),
        memory: column(40),
        disk: column(50),
        load1: column(1),
        temperature: column(null),
        netRx: column(100),
        netTx: column(200),
        diskRead: column(300),
        diskWrite: column(400),
      },
    };
    const series = seriesFromHistory(history);
    expect(series.cpu).toEqual([20]);
    expect(series.cpuMax).toEqual([30]);
    expect(series.memory).toEqual([40]);
    expect(series.temperature).toEqual([null]);
    expect(series.diskWrite).toEqual([400]);
  });
});

describe("helpers", () => {
  it("finds readings and the latest one past gaps", () => {
    expect(hasReadings([null, null])).toBe(false);
    expect(hasReadings([null, 1])).toBe(true);
    expect(latestReading([1, 2, null])).toBe(2);
    expect(latestReading([null])).toBeNull();
  });

  it("grades values against thresholds", () => {
    expect(thresholdTone(null, 70, 90)).toBe("none");
    expect(thresholdTone(50, 70, 90)).toBe("normal");
    expect(thresholdTone(75, 70, 90)).toBe("warning");
    expect(thresholdTone(95, 70, 90)).toBe("critical");
  });

  it("adds alpha to oklch colors and leaves others alone", () => {
    expect(withAlpha("oklch(0.8 0.1 235)", 0.2)).toBe("oklch(0.8 0.1 235 / 0.2)");
    expect(withAlpha("oklch(0.2 0 0 / 10%)", 0.2)).toBe("oklch(0.2 0 0 / 10%)");
    expect(withAlpha("#123456", 0.2)).toBe("#123456");
  });
});
