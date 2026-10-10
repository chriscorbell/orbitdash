import { z } from "zod";
import type {
  HostSnapshot,
  MetricHistory,
  MetricHistoryRange,
  SystemInfo,
  DockerSnapshot,
} from "./types";

/** Bumped when HostSnapshot changes in a way older clients can't read. */
export const HOST_SNAPSHOT_VERSION = 1;

const rate = z.number().nullable();

export const hostSnapshotSchema = z.object({
  version: z.literal(HOST_SNAPSHOT_VERSION),
  ts: z.number(),
  intervalMs: z.number().nullable(),
  cpu: z.object({
    usage: z.number().nullable(),
    cores: z.array(
      z.object({
        id: z.number(),
        usage: z.number().nullable(),
        frequencyMhz: z.number().nullable(),
      })
    ),
    load: z.object({ one: z.number(), five: z.number(), fifteen: z.number() }).nullable(),
    frequencyMhz: z.number().nullable(),
    temperatureCelsius: z.number().nullable(),
  }),
  memory: z
    .object({
      totalBytes: z.number(),
      usedBytes: z.number(),
      availableBytes: z.number(),
      cachedBytes: z.number().nullable(),
      swapTotalBytes: z.number().nullable(),
      swapUsedBytes: z.number().nullable(),
    })
    .nullable(),
  temperatures: z.array(
    z.object({
      id: z.string(),
      chip: z.string(),
      label: z.string().nullable(),
      celsius: z.number(),
    })
  ),
  filesystems: z.array(
    z.object({
      mountpoint: z.string(),
      device: z.string(),
      type: z.string(),
      totalBytes: z.number(),
      usedBytes: z.number(),
      availableBytes: z.number(),
    })
  ),
  disks: z.array(z.object({ name: z.string(), readBytesPerSec: rate, writeBytesPerSec: rate })),
  network: z.array(z.object({ name: z.string(), rxBytesPerSec: rate, txBytesPerSec: rate })),
}) satisfies z.ZodType<HostSnapshot>;

export const systemInfoSchema = z.object({
  cpuCount: z.number(),
  cpuModel: z.string().nullable(),
  hostname: z.string().nullable(),
  kernel: z.string().nullable(),
  osName: z.string().nullable(),
  platform: z.string(),
  uptimeSeconds: z.number(),
  docker: z.boolean(),
}) satisfies z.ZodType<SystemInfo>;

/** Every range GET /api/metrics/history accepts, shortest first. */
export const METRIC_HISTORY_RANGES = [
  "1h",
  "24h",
  "7d",
  "30d",
] as const satisfies readonly MetricHistoryRange[];

const historyValues = z.array(z.number().nullable());
const historySeries = z.object({ avg: historyValues, max: historyValues });

export const metricHistorySchema = z.object({
  range: z.enum(METRIC_HISTORY_RANGES),
  resolutionMs: z.number(),
  from: z.number(),
  to: z.number(),
  ts: z.array(z.number()),
  series: z.object({
    cpu: historySeries,
    memory: historySeries,
    disk: historySeries,
    load1: historySeries,
    temperature: historySeries,
    netRx: historySeries,
    netTx: historySeries,
    diskRead: historySeries,
    diskWrite: historySeries,
  }),
}) satisfies z.ZodType<MetricHistory>;

export const dockerSnapshotSchema = z.object({
  configured: z.boolean(),
  available: z.boolean(),
  error: z.string().nullable(),
  containers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      image: z.string(),
      state: z.enum(["created", "running", "paused", "restarting", "removing", "exited", "dead"]),
      status: z.string(),
      health: z.enum(["healthy", "unhealthy", "starting"]).nullable(),
      createdAt: z.number(),
      ports: z.array(
        z.object({
          privatePort: z.number(),
          publicPort: z.number(),
          protocol: z.enum(["tcp", "udp", "sctp"]),
        })
      ),
      composeProject: z.string().nullable(),
      cpuPercent: z.number().nullable(),
      memoryBytes: z.number().nullable(),
      memoryLimitBytes: z.number().nullable(),
    })
  ),
  updatedAt: z.number().nullable(),
}) satisfies z.ZodType<DockerSnapshot>;
