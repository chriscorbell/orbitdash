import type { HostSnapshot, MetricHistory } from "@shared/types";

/** How many live readings the Stats page keeps: five minutes at one per second. */
export const LIVE_WINDOW = 300;

/** Columns for one chart: timestamps in ms, then one array per series. */
export type ChartColumns = [number[], ...Array<Array<number | null>>];

export interface StatsSeries {
  ts: number[];
  cpu: Array<number | null>;
  cpuMax: Array<number | null>;
  memory: Array<number | null>;
  netRx: Array<number | null>;
  netTx: Array<number | null>;
  diskRead: Array<number | null>;
  diskWrite: Array<number | null>;
  temperature: Array<number | null>;
  load1: Array<number | null>;
}

function sum(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
}

/** Adds a reading to the live buffer, keeping order, dropping repeats and the oldest beyond the window. */
export function appendSnapshot(
  buffer: readonly HostSnapshot[],
  snapshot: HostSnapshot,
  limit = LIVE_WINDOW
): HostSnapshot[] {
  const last = buffer.at(-1);
  if (last && snapshot.ts <= last.ts) return buffer as HostSnapshot[];
  const next = [...buffer, snapshot];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** Live readings as chart columns; live data has no separate max, so it repeats the value. */
export function seriesFromSnapshots(snapshots: readonly HostSnapshot[]): StatsSeries {
  const series: StatsSeries = {
    ts: [],
    cpu: [],
    cpuMax: [],
    memory: [],
    netRx: [],
    netTx: [],
    diskRead: [],
    diskWrite: [],
    temperature: [],
    load1: [],
  };
  for (const snapshot of snapshots) {
    const memory = snapshot.memory;
    series.ts.push(snapshot.ts);
    series.cpu.push(snapshot.cpu.usage);
    series.cpuMax.push(snapshot.cpu.usage);
    series.memory.push(
      memory && memory.totalBytes > 0 ? (memory.usedBytes / memory.totalBytes) * 100 : null
    );
    series.netRx.push(sum(snapshot.network.map((entry) => entry.rxBytesPerSec)));
    series.netTx.push(sum(snapshot.network.map((entry) => entry.txBytesPerSec)));
    series.diskRead.push(sum(snapshot.disks.map((entry) => entry.readBytesPerSec)));
    series.diskWrite.push(sum(snapshot.disks.map((entry) => entry.writeBytesPerSec)));
    series.temperature.push(snapshot.cpu.temperatureCelsius);
    series.load1.push(snapshot.cpu.load?.one ?? null);
  }
  return series;
}

/** Rolled-up history as chart columns: averages as the lines, and CPU's peaks for its band. */
export function seriesFromHistory(history: MetricHistory): StatsSeries {
  const { series } = history;
  return {
    ts: history.ts,
    cpu: series.cpu.avg,
    cpuMax: series.cpu.max,
    memory: series.memory.avg,
    netRx: series.netRx.avg,
    netTx: series.netTx.avg,
    diskRead: series.diskRead.avg,
    diskWrite: series.diskWrite.avg,
    temperature: series.temperature.avg,
    load1: series.load1.avg,
  };
}

/** Whether a series has any reading at all, so charts for unsupported metrics can be skipped. */
export function hasReadings(values: ReadonlyArray<number | null>): boolean {
  return values.some((value) => value !== null);
}

/** The last reading in a series, skipping gaps. */
export function latestReading(values: ReadonlyArray<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) return values[index];
  }
  return null;
}

/** Tone for a usage percentage or temperature against warning and critical thresholds. */
export function thresholdTone(
  value: number | null,
  warning: number,
  critical: number
): "normal" | "warning" | "critical" | "none" {
  if (value === null) return "none";
  if (value >= critical) return "critical";
  if (value >= warning) return "warning";
  return "normal";
}
