import type { HostSnapshot } from "@shared/types";

export interface SnapshotReadings {
  cpu?: number | null;
  intervalMs?: number | null;
  load1?: number;
  memoryPercent?: number | null;
  rates?: { rx?: number | null; tx?: number | null; read?: number | null; write?: number | null };
  temperature?: number | null;
}

/** A host snapshot taken at `ts` with just the readings history keeps. */
export function historySnapshot(ts: number, readings: SnapshotReadings = {}): HostSnapshot {
  const { rx = 1000, tx = 500, read = 4096, write = 8192 } = readings.rates ?? {};
  const memoryPercent = readings.memoryPercent === undefined ? 50 : readings.memoryPercent;
  return {
    version: 1,
    ts,
    intervalMs: readings.intervalMs === undefined ? 10_000 : readings.intervalMs,
    cpu: {
      usage: readings.cpu === undefined ? 20 : readings.cpu,
      cores: [],
      load: { one: readings.load1 ?? 1, five: 1, fifteen: 1 },
      frequencyMhz: null,
      temperatureCelsius: readings.temperature === undefined ? 50 : readings.temperature,
    },
    memory:
      memoryPercent === null
        ? null
        : {
            totalBytes: 1000,
            usedBytes: memoryPercent * 10,
            availableBytes: 1000 - memoryPercent * 10,
            cachedBytes: null,
            swapTotalBytes: null,
            swapUsedBytes: null,
          },
    temperatures: [],
    filesystems: [],
    disks: [{ name: "sda", readBytesPerSec: read, writeBytesPerSec: write }],
    network: [{ name: "eth0", rxBytesPerSec: rx, txBytesPerSec: tx }],
  };
}
