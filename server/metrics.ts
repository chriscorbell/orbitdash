import os from "os";
import fs from "fs";
import { execFileSync } from "child_process";
import { METRICS_RETENTION_SECONDS } from "@shared/server-schemas";
import type { MetricSample } from "@shared/types";

/** Collect current system metrics */
export function collectMetrics(): MetricSample {
  const cpu = getCpuUsage();
  const ram = getRamUsage();
  const disk = getDiskUsage();
  const ts = Date.now();
  return { ts, cpu, ram, disk };
}

/** CPU usage as percentage (0-100) based on /proc/stat or os.cpus() */
let prevIdle = 0;
let prevTotal = 0;

function getCpuUsage(): number {
  try {
    // Try Linux /proc/stat first (works in Docker)
    const stat = fs.readFileSync("/proc/stat", "utf-8");
    const cpuLine = stat.split("\n")[0]; // "cpu  user nice system idle ..."
    const parts = cpuLine.split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0); // idle + iowait
    const total = parts.reduce((a, b) => a + b, 0);

    const diffIdle = idle - prevIdle;
    const diffTotal = total - prevTotal;
    prevIdle = idle;
    prevTotal = total;

    if (diffTotal === 0) return 0;
    return Math.round(((diffTotal - diffIdle) / diffTotal) * 10000) / 100;
  } catch {
    // Fallback: use os.cpus()
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    const diffIdle = totalIdle - prevIdle;
    const diffTotal = totalTick - prevTotal;
    prevIdle = totalIdle;
    prevTotal = totalTick;

    if (diffTotal === 0) return 0;
    return Math.round(((diffTotal - diffIdle) / diffTotal) * 10000) / 100;
  }
}

/** RAM usage as percentage */
function getRamUsage(): number {
  try {
    // Use /proc/meminfo for accurate "available" memory (matches btop/htop/free)
    const meminfo = fs.readFileSync("/proc/meminfo", "utf-8");
    const getValue = (key: string): number => {
      const match = meminfo.match(new RegExp(`${key}:\\s+(\\d+)`));
      return match ? parseInt(match[1], 10) * 1024 : 0; // convert kB to bytes
    };
    const total = getValue("MemTotal");
    const available = getValue("MemAvailable");
    if (total === 0) throw new Error("Could not read MemTotal");
    const used = total - available;
    return Math.round((used / total) * 10000) / 100;
  } catch {
    // macOS fallback: use vm_stat to compute available memory the same way
    // btop/Activity Monitor do (free + inactive + speculative + purgeable pages)
    try {
      return getMacRamUsage();
    } catch {
      // Last resort: os.freemem counts only truly-free pages and will over-report usage
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      return Math.round((used / total) * 10000) / 100;
    }
  }
}

function getMacRamUsage(): number {
  const vmstat = execFileSync("vm_stat", { encoding: "utf-8" });
  const pageSize = (() => {
    const match = vmstat.match(/page size of (\d+) bytes/);
    return match ? parseInt(match[1], 10) : 4096;
  })();
  const getPages = (key: string): number => {
    const match = vmstat.match(new RegExp(`${key}:\\s+(\\d+)\\.`));
    return match ? parseInt(match[1], 10) : 0;
  };
  const free = getPages("Pages free");
  const inactive = getPages("Pages inactive");
  const speculative = getPages("Pages speculative");
  const purgeable = getPages("Pages purgeable");
  const total = os.totalmem();
  const available = (free + inactive + speculative + purgeable) * pageSize;
  const used = Math.max(0, total - available);
  return Math.round((used / total) * 10000) / 100;
}

/** Disk usage as percentage. Uses configured mount or root. */
function getDiskUsage(): number {
  const mountPath = process.env.ORBITDASH_DISK_PATH || "/";

  const parse = (result: string, blockSize: number): number => {
    const lines = result.trim().split("\n");
    const dataLine = lines[lines.length - 1] || "";
    const parts = dataLine.trim().split(/\s+/);
    // parts: [filesystem, total-blocks, used, available, use%, mountpoint]
    // Use total from parts[1] rather than used+available — the latter ignores
    // reserved blocks (Linux) and other APFS volumes (macOS), causing under-reporting.
    const total = parseInt(parts[1], 10) * blockSize;
    const available = parseInt(parts[3], 10) * blockSize;
    if (total === 0) return 0;
    const used = total - available;
    return Math.round((used / total) * 10000) / 100;
  };

  try {
    // Use a POSIX-compatible format so the same command works on macOS and Linux.
    const result = execFileSync("df", ["-Pk", mountPath], { encoding: "utf-8" });
    return parse(result, 1024);
  } catch {
    return 0;
  }
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

// SSE subscribers
type SseCallback = (sample: MetricSample) => void;
const subscribers = new Set<SseCallback>();

export function subscribe(cb: SseCallback): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Start the collection loop (1 sample per second) */
let collectionInterval: ReturnType<typeof setInterval> | null = null;

export function startCollection(): void {
  if (collectionInterval) return;

  // Take an initial reading to prime the CPU diff counters
  collectMetrics();

  collectionInterval = setInterval(() => {
    const sample = collectMetrics();
    storeSample(sample);

    // Notify SSE subscribers
    for (const cb of subscribers) {
      try {
        cb(sample);
      } catch {
        subscribers.delete(cb);
      }
    }
  }, 1000);
}

export function stopCollection(): void {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
  }
}

export function isCollectionRunning(): boolean {
  return collectionInterval !== null;
}
