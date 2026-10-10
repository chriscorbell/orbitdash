import type { ContainerInfo } from "@shared/types";

export interface ContainerSummary {
  total: number;
  running: number;
  unhealthy: number;
  /** Exited, dead or never started. */
  stopped: number;
  /** Restarting or paused. */
  other: number;
}

export function summarizeContainers(containers: readonly ContainerInfo[]): ContainerSummary {
  const summary: ContainerSummary = { total: 0, running: 0, unhealthy: 0, stopped: 0, other: 0 };
  for (const container of containers) {
    summary.total += 1;
    if (container.state === "running") {
      summary.running += 1;
      if (container.health === "unhealthy") summary.unhealthy += 1;
    } else if (container.state === "restarting" || container.state === "paused") {
      summary.other += 1;
    } else {
      summary.stopped += 1;
    }
  }
  return summary;
}

/** "1 unhealthy · 2 stopped", or null when everything is running and healthy. */
export function describeSummary(summary: ContainerSummary): string | null {
  const parts = [
    summary.unhealthy ? `${summary.unhealthy} unhealthy` : null,
    summary.other ? `${summary.other} restarting or paused` : null,
    summary.stopped ? `${summary.stopped} stopped` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type ContainerTone = "up" | "warning" | "down" | "idle";

/** How a container's dot reads: green when running and healthy, amber when not quite, red when unhealthy. */
export function containerTone(container: ContainerInfo): ContainerTone {
  if (container.state === "running") {
    if (container.health === "unhealthy") return "down";
    return container.health === "starting" ? "warning" : "up";
  }
  if (container.state === "restarting" || container.state === "paused") return "warning";
  if (container.state === "dead") return "down";
  return "idle";
}

export type ContainerSort = "name" | "cpu" | "memory";

/** Running containers first, then by the chosen column (busiest first for CPU and memory). */
export function sortContainers(
  containers: readonly ContainerInfo[],
  sort: ContainerSort
): ContainerInfo[] {
  const rank = (container: ContainerInfo) => (container.state === "running" ? 0 : 1);
  return [...containers].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (sort === "cpu")
      return (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1) || a.name.localeCompare(b.name);
    if (sort === "memory") {
      return (b.memoryBytes ?? -1) - (a.memoryBytes ?? -1) || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });
}

/** A published TCP port as a link on the host the dashboard was opened from. */
export function portUrl(
  port: ContainerInfo["ports"][number],
  location: Pick<Location, "hostname">
): string | null {
  if (port.protocol !== "tcp") return null;
  const host = location.hostname.includes(":") ? `[${location.hostname}]` : location.hostname;
  const scheme = port.privatePort === 443 || port.publicPort === 443 ? "https" : "http";
  return `${scheme}://${host}:${port.publicPort}`;
}
