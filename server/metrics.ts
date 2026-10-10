import { METRICS_RETENTION_SECONDS } from "@shared/server-schemas";
import type { HostSnapshot, MetricSample } from "@shared/types";
import { createHostCollector, diskUsagePercent, toMetricSample } from "./host/collector";
import { getHostFs, toHostPath, type HostFs } from "./host/host-fs";
import { writeLog } from "./observability";

const collector = createHostCollector({ fs: getHostFs() });
let latestSnapshot: HostSnapshot | null = null;

/**
 * Disk use of the configured mount (or /), read with statfs. With ORBITDASH_HOST_ROOT set, the
 * path is a host path read under that root.
 */
export function getDiskUsage(
  mountPath: string = process.env.ORBITDASH_DISK_PATH || "/",
  hostFs: HostFs = getHostFs()
): number {
  return diskUsagePercent(hostFs.statfs(toHostPath(hostFs.root, mountPath)));
}

/** One reading of the host: the full snapshot, and the strip's sample derived from it. */
function collect(): { sample: MetricSample; snapshot: HostSnapshot } {
  const snapshot = collector.collect(Date.now());
  latestSnapshot = snapshot;
  return { sample: toMetricSample(snapshot, getDiskUsage()), snapshot };
}

/** The most recent snapshot, reading the host now if nothing has been collected yet. */
export function getLatestSnapshot(): HostSnapshot {
  return latestSnapshot ?? collect().snapshot;
}

// Samples live in memory only: retention is a minute, so persisting them
// bought nothing across restarts while writing to disk once per second.
const sampleBuffer: MetricSample[] = [];

/** Append a sample and prune ones older than the retention period */
export function storeSample(sample: MetricSample): void {
  sampleBuffer.push(sample);

  const cutoff = Date.now() - METRICS_RETENTION_SECONDS * 1000;
  while (sampleBuffer.length > 0 && sampleBuffer[0].ts < cutoff) {
    sampleBuffer.shift();
  }
}

/** Get recent samples within a time window (in seconds) */
export function getRecentSamples(windowSec: number = 30): MetricSample[] {
  const cutoff = Date.now() - windowSec * 1000;
  return sampleBuffer.filter((sample) => sample.ts > cutoff);
}

// Live subscribers: samples feed the strip, snapshots feed the `host` event topic.
const subscribers = new Set<(sample: MetricSample) => void>();
const snapshotSubscribers = new Set<(snapshot: HostSnapshot) => void>();

function addSubscriber<T>(set: Set<T>, cb: T): () => void {
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}

export function subscribe(cb: (sample: MetricSample) => void): () => void {
  return addSubscriber(subscribers, cb);
}

export function subscribeSnapshots(cb: (snapshot: HostSnapshot) => void): () => void {
  return addSubscriber(snapshotSubscribers, cb);
}

/** Delivers to every subscriber, dropping any that throw. */
function deliver<T>(set: Set<(value: T) => void>, value: T): void {
  for (const cb of set) {
    try {
      cb(value);
    } catch {
      set.delete(cb);
    }
  }
}

/** Sampling cadence while someone watches the live stream, and while nobody does. */
export const ACTIVE_SAMPLE_INTERVAL_MS = 1_000;
export const IDLE_SAMPLE_INTERVAL_MS = 10_000;

let collectionInterval: ReturnType<typeof setInterval> | null = null;
let lastSampleAt = 0;

/** One collection tick: samples every tick while subscribed, otherwise every 10 seconds. */
export function tickCollection(now: number = Date.now()): MetricSample | null {
  const watched = subscribers.size > 0 || snapshotSubscribers.size > 0;
  const interval = watched ? ACTIVE_SAMPLE_INTERVAL_MS : IDLE_SAMPLE_INTERVAL_MS;
  // Small tolerance so a 1s timer that fires a few ms early doesn't skip a sample.
  if (now - lastSampleAt < interval - 50) {
    return null;
  }

  lastSampleAt = now;
  const { sample, snapshot } = collect();
  storeSample(sample);
  deliver(subscribers, sample);
  deliver(snapshotSubscribers, snapshot);

  return sample;
}

/** Start the collection loop */
export function startCollection(): void {
  if (collectionInterval) return;

  const hostFs = getHostFs();
  if (hostFs.root && hostFs.read("/proc/stat") === null) {
    writeLog("warn", "metrics.host_root_unreadable", { root: hostFs.root });
  }

  // Take an initial reading so the first tick already has counters to compute rates against
  collect();
  lastSampleAt = 0;

  collectionInterval = setInterval(() => tickCollection(), ACTIVE_SAMPLE_INTERVAL_MS);
}

export function stopCollection(): void {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
  }
  lastSampleAt = 0;
}

export function isCollectionRunning(): boolean {
  return collectionInterval !== null;
}
