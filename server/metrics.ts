import os from "os";
import fs from "fs";
import { getDb } from "./db";
import type { MetricSample } from "../src/shared/types";

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
    // Fallback: os.freemem (less accurate, counts buffers/cache as used)
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return Math.round((used / total) * 10000) / 100;
  }
}

/** Disk usage as percentage. Uses configured mount or root. */
function getDiskUsage(): number {
  const mountPath = process.env.ORBITDASH_DISK_PATH || "/";
  try {
    // Use df command output parsed from /proc on Linux
    const result = require("child_process").execSync(
      `df -B1 "${mountPath}" | tail -1`,
      { encoding: "utf-8" }
    );
    const parts = result.trim().split(/\s+/);
    // parts: [filesystem, 1K-blocks, used, available, use%, mountpoint]
    const used = parseInt(parts[2], 10);
    const available = parseInt(parts[3], 10);
    const total = used + available;
    if (total === 0) return 0;
    return Math.round((used / total) * 10000) / 100;
  } catch {
    return 0;
  }
}

/** Insert a sample and prune old ones */
export function storeSample(sample: MetricSample): void {
  const db = getDb();
  const insert = db.prepare(
    "INSERT OR REPLACE INTO metrics_samples (ts, cpu, ram, disk) VALUES (?, ?, ?, ?)"
  );
  const prune = db.prepare("DELETE FROM metrics_samples WHERE ts < ?");
  const cutoff = Date.now() - 60_000;

  const transaction = db.transaction(() => {
    insert.run(sample.ts, sample.cpu, sample.ram, sample.disk);
    prune.run(cutoff);
  });
  transaction();
}

/** Get recent samples within a time window (in seconds) */
export function getRecentSamples(windowSec: number = 30): MetricSample[] {
  const db = getDb();
  const cutoff = Date.now() - windowSec * 1000;
  const stmt = db.prepare(
    "SELECT ts, cpu, ram, disk FROM metrics_samples WHERE ts > ? ORDER BY ts ASC"
  );
  return stmt.all(cutoff) as MetricSample[];
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
