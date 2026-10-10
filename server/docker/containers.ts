import type { ContainerInfo, ContainerState } from "@shared/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const STATES = new Set<ContainerState>([
  "created",
  "running",
  "paused",
  "restarting",
  "removing",
  "exited",
  "dead",
]);

function parseHealth(entry: Record<string, unknown>, status: string): ContainerInfo["health"] {
  const health = isRecord(entry.Health) ? entry.Health.Status : null;
  const value =
    typeof health === "string"
      ? health
      : (/\((healthy|unhealthy|health: starting)\)/.exec(status)?.[1] ?? null);
  if (value === "healthy" || value === "unhealthy") return value;
  if (value === "starting" || value === "health: starting") return "starting";
  return null;
}

function parsePorts(ports: unknown): ContainerInfo["ports"] {
  if (!Array.isArray(ports)) return [];
  const seen = new Set<string>();
  const result: ContainerInfo["ports"] = [];
  for (const port of ports.filter(isRecord)) {
    const privatePort = Number(port.PrivatePort);
    const publicPort = Number(port.PublicPort);
    const protocol = port.Type === "udp" || port.Type === "sctp" ? port.Type : "tcp";
    if (!Number.isInteger(publicPort) || publicPort <= 0) continue;
    const key = `${publicPort}/${protocol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ privatePort, publicPort, protocol });
  }
  return result.sort((a, b) => a.publicPort - b.publicPort);
}

/** One entry of GET /containers/json, or null when it isn't one. */
export function parseContainer(
  entry: unknown
): Omit<ContainerInfo, "cpuPercent" | "memoryBytes" | "memoryLimitBytes"> | null {
  if (!isRecord(entry) || typeof entry.Id !== "string") return null;
  const names = Array.isArray(entry.Names) ? entry.Names : [];
  const name = typeof names[0] === "string" ? names[0].replace(/^\//, "") : entry.Id.slice(0, 12);
  const status = typeof entry.Status === "string" ? entry.Status : "";
  const state =
    typeof entry.State === "string" && STATES.has(entry.State as ContainerState)
      ? (entry.State as ContainerState)
      : "created";
  const labels = isRecord(entry.Labels) ? entry.Labels : {};
  const project = labels["com.docker.compose.project"];
  return {
    id: entry.Id.slice(0, 12),
    name,
    image: typeof entry.Image === "string" ? entry.Image.replace(/@sha256:[0-9a-f]+$/, "") : "",
    state,
    status,
    health: parseHealth(entry, status),
    createdAt: typeof entry.Created === "number" ? entry.Created * 1000 : 0,
    ports: parsePorts(entry.Ports),
    composeProject: typeof project === "string" && project ? project : null,
  };
}

export interface CpuSample {
  containerUsage: number;
  systemUsage: number;
}

/** Memory in use and the limit from a stats answer, minus reclaimable file cache like `docker stats`. */
export function parseStats(stats: unknown): {
  cpu: CpuSample | null;
  memoryBytes: number | null;
  memoryLimitBytes: number | null;
} {
  if (!isRecord(stats)) return { cpu: null, memoryBytes: null, memoryLimitBytes: null };
  const cpuStats = isRecord(stats.cpu_stats) ? stats.cpu_stats : {};
  const usage = isRecord(cpuStats.cpu_usage) ? cpuStats.cpu_usage : {};
  const total = Number(usage.total_usage);
  const system = Number(cpuStats.system_cpu_usage);
  const cpu =
    Number.isFinite(total) && Number.isFinite(system) && system > 0
      ? { containerUsage: total, systemUsage: system }
      : null;

  const memory = isRecord(stats.memory_stats) ? stats.memory_stats : {};
  const detail = isRecord(memory.stats) ? memory.stats : {};
  const rawUsage = Number(memory.usage);
  const cache = Number(detail.inactive_file ?? detail.total_inactive_file ?? 0);
  const limit = Number(memory.limit);
  return {
    cpu,
    memoryBytes:
      Number.isFinite(rawUsage) && rawUsage > 0
        ? Math.max(0, rawUsage - (Number.isFinite(cache) ? cache : 0))
        : null,
    memoryLimitBytes: Number.isFinite(limit) && limit > 0 ? limit : null,
  };
}

/**
 * CPU use between two samples as a share of the whole host (0 to 100), so it reads like the host
 * CPU tile. `docker stats` multiplies this by the CPU count instead.
 */
export function cpuPercent(previous: CpuSample | undefined, next: CpuSample): number | null {
  if (!previous) return null;
  const containerDelta = next.containerUsage - previous.containerUsage;
  const systemDelta = next.systemUsage - previous.systemUsage;
  if (containerDelta < 0 || systemDelta <= 0) return null;
  return Math.round((containerDelta / systemDelta) * 1000) / 10;
}
