import type { IntegrationStat } from "@shared/types";
import { dockerMonitor } from "../../docker/monitor";
import { formatPercent } from "../format";
import { IntegrationError, type IntegrationAdapter } from "../types";

function formatMemory(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

const STATE_LABELS: Record<string, string> = {
  created: "Created",
  running: "Running",
  paused: "Paused",
  restarting: "Restarting",
  removing: "Removing",
  exited: "Stopped",
  dead: "Dead",
};

/**
 * A Docker container linked to the service: its state and health, CPU and memory, read from the
 * container monitor rather than an app's API.
 */
export const docker: IntegrationAdapter = {
  id: "docker",
  name: "Docker container",
  icon: "docker",
  pollIntervalMs: 15_000,
  fields: [
    {
      key: "container",
      label: "Container",
      kind: "text",
      required: true,
      placeholder: "jellyfin",
      help: "The container's name, as docker ps shows it.",
    },
  ],
  async read(config) {
    const snapshot = dockerMonitor.snapshot();
    if (!snapshot.available)
      throw new IntegrationError(snapshot.error ?? "Docker can't be reached");
    const name = String(config.values.container ?? "").trim();
    const container = snapshot.containers.find((entry) => entry.name === name);
    if (!container) throw new IntegrationError(`No container named ${name}`);

    const running = container.state === "running";
    const state =
      running && container.health === "unhealthy"
        ? "Unhealthy"
        : running && container.health === "starting"
          ? "Starting"
          : STATE_LABELS[container.state];
    const stats: IntegrationStat[] = [
      {
        label: "Container",
        value: state,
        tone:
          state === "Running"
            ? "good"
            : state === "Starting" || state === "Restarting" || state === "Paused"
              ? "warning"
              : "bad",
      },
    ];
    if (running && container.cpuPercent !== null) {
      stats.push({ label: "CPU", value: formatPercent(container.cpuPercent) });
    }
    if (running && container.memoryBytes !== null) {
      stats.push({ label: "Memory", value: formatMemory(container.memoryBytes) });
    }
    return stats;
  },
};
